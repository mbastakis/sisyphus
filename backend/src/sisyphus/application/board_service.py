from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..config.models import AppConfig, BoardConfig, ColumnConfig
from ..domain import commands as cmd
from ..domain.errors import (
    ConflictError,
    NotFoundError,
    PromptRequiredError,
    ReadOnlyColumnError,
    ValidationError,
)
from ..domain.task import Task, local_date, local_today, server_timezone
from ..repositories.port import TaskFilter, TaskRepository
from . import ranks


class BoardService:
    def __init__(self, config: AppConfig, repo: TaskRepository):
        self.config = config
        self.repo = repo

    # -- projection ----------------------------------------------------------

    def list_boards(self) -> list[dict]:
        return [
            {"id": b.id, "name": b.name, "description": b.description}
            for b in self.config.boards
        ]

    def _board(self, board_id: str) -> BoardConfig:
        board = self.config.board(board_id)
        if board is None:
            raise NotFoundError(f"board {board_id!r} not found")
        return board

    def _scope_filter(self, board: BoardConfig) -> TaskFilter:
        statuses = ["pending", "waiting"]
        if board.scope.filter:
            parsed = [
                tok.split(":", 1)[1]
                for tok in board.scope.filter.split()
                if tok.startswith("status:")
            ]
            if parsed:
                statuses = parsed
        if board.template in ("lifecycle", "project-lifecycle") and "completed" not in statuses:
            statuses.append("completed")
        completed_after = None
        if "completed" in statuses:
            completed_after = datetime.now(UTC) - timedelta(
                days=board.scope.completed_days
            )
        return TaskFilter(
            statuses=statuses,
            project=board.scope.project,
            include_descendants=board.scope.include_descendants,
            completed_after=completed_after,
        )

    def _matches(self, board: BoardConfig, col: ColumnConfig, task: Task) -> bool:
        m = col.match
        if m.preset:
            ready = board.ready_tag
            match m.preset:
                case "backlog":
                    return (
                        task.status == "pending"
                        and not task.active
                        and ready not in task.tags
                    )
                case "ready":
                    return task.status == "pending" and not task.active and ready in task.tags
                case "doing":
                    return task.status == "pending" and task.active
                case "waiting":
                    return task.status == "waiting"
                case "done":
                    return task.status == "completed"
        f = (m.filter or "").strip()
        today = local_today()
        if f == "due.before:today":
            return task.due is not None and local_date(task.due) < today
        if f == "due:today":
            return task.due is not None and local_date(task.due) == today
        if f == "due.after:today":
            return task.due is not None and local_date(task.due) > today
        if f == "due.none:":
            return task.due is None
        raise ValidationError(f"unsupported column match filter {f!r}")

    def _classify(self, board: BoardConfig, tasks: list[Task]) -> tuple[dict[str, list[Task]], int]:
        buckets: dict[str, list[Task]] = {c.id: [] for c in board.columns}
        unmapped = 0
        for task in tasks:
            for col in board.columns:
                if self._matches(board, col, task):
                    buckets[col.id].append(task)
                    break
            else:
                unmapped += 1
        return buckets, unmapped

    def _sort(self, board: BoardConfig, tasks: list[Task]) -> list[Task]:
        keys = board.ordering.keys()

        def computed_key(t: Task):
            parts = []
            for field, direction in keys:
                v = getattr(t, field, None)
                if isinstance(v, datetime):
                    v = v.timestamp()
                if v is None:
                    parts.append((1, 0))
                    continue
                if direction == "desc":
                    v = -v
                parts.append((0, v))
            return tuple(parts)

        if board.ordering.mode == "manual":
            uda = board.ordering.rank_uda or ""

            def manual_key(t: Task):
                r = ranks.parse_rank(t.rank_for(uda))
                return (0, r, ()) if r is not None else (1, 0, computed_key(t))

            return sorted(tasks, key=manual_key)
        return sorted(tasks, key=computed_key)

    def projection(self, board_id: str) -> dict:
        board = self._board(board_id)
        tasks = self.repo.query(self._scope_filter(board))
        by_uuid = {t.uuid: t for t in tasks}
        buckets, unmapped = self._classify(board, tasks)
        columns = []
        for col in board.columns:
            cards = self._sort(board, buckets[col.id])
            prompt = None
            if col.write and col.write.prompt:
                prompt = col.write.prompt.model_dump()
            elif col.write and col.write.preset == "waiting":
                prompt = {"field": "wait", "input": "date"}
            columns.append(
                {
                    "id": col.id,
                    "name": col.name,
                    "read_only": col.read_only,
                    "wip_limit": col.wip_limit,
                    "prompt": prompt,
                    "count": len(cards),
                    "cards": [_card(t, board, by_uuid) for t in cards],
                }
            )
        last_sync = getattr(self.repo, "last_sync", None)
        sync_detail = getattr(self.repo, "sync_detail", None)
        return {
            "board": {
                "id": board.id,
                "name": board.name,
                "description": board.description,
                "ordering_mode": board.ordering.mode,
                "mobile_default_column": board.mobile.default_column,
                "ready_tag": board.ready_tag,
            },
            "generation": self.repo.generation,
            "generated_at": datetime.now(UTC).isoformat(),
            "server_timezone": str(server_timezone()),
            "sync": {
                "status": "degraded" if sync_detail else "synced" if last_sync else "unknown",
                "last_success": last_sync.isoformat() if last_sync else None,
                "detail": sync_detail,
            },
            "unmapped": unmapped,
            "columns": columns,
        }

    # -- mutations -----------------------------------------------------------

    def create_task(self, board_id: str, payload: dict) -> Task:
        board = self._board(board_id)
        description = (payload.get("description") or "").strip()
        if not description:
            raise ValidationError("description is required")
        project = payload.get("project") or None
        if board.scope.project and not project:
            project = board.scope.project
        due = _parse_date(payload.get("due"))
        task = self.repo.create(
            cmd.CreateTask(
                description=description,
                project=project,
                tags=payload.get("tags") or [],
                priority=payload.get("priority") or None,
                due=due,
            )
        )
        column_id = payload.get("column_id")
        if column_id:
            col = self._column(board, column_id)
            if not col.read_only:
                mutations = self._write_mutations(
                    board, col, task, _parse_date(payload.get("prompt_value"))
                )
                if mutations:
                    task = self.repo.apply(task.uuid, mutations)
        return task

    def _column(self, board: BoardConfig, column_id: str) -> ColumnConfig:
        for col in board.columns:
            if col.id == column_id:
                return col
        raise NotFoundError(f"column {column_id!r} not found on board {board.id!r}")

    def _write_mutations(
        self,
        board: BoardConfig,
        col: ColumnConfig,
        task: Task,
        prompt_value: datetime | None,
    ) -> list[cmd.TaskMutation]:
        assert col.write is not None
        w = col.write
        muts: list[cmd.TaskMutation] = []
        ready = board.ready_tag

        def leave_current_state():
            if task.status == "completed":
                muts.append(cmd.Reopen())
            if task.active:
                muts.append(cmd.Stop())

        if w.preset:
            match w.preset:
                case "backlog":
                    leave_current_state()
                    muts.append(cmd.RemoveTag(ready))
                    muts.append(cmd.SetField("wait", None))
                case "ready":
                    leave_current_state()
                    muts.append(cmd.AddTag(ready))
                    muts.append(cmd.SetField("wait", None))
                case "doing":
                    if task.status == "completed":
                        muts.append(cmd.Reopen())
                    muts.append(cmd.SetField("wait", None))
                    muts.append(cmd.Start())
                case "waiting":
                    if prompt_value is None:
                        raise PromptRequiredError(
                            "Waiting needs a wait-until date", "wait", "date"
                        )
                    leave_current_state()
                    muts.append(cmd.SetField("wait", prompt_value))
                case "done":
                    if task.status != "completed":
                        muts.append(cmd.Complete())
        elif w.set is not None:
            for field, value in w.set.items():
                muts.append(cmd.SetField(field, _resolve_value(field, value)))
        elif w.clear is not None:
            for field in w.clear:
                muts.append(cmd.SetField(field, None))
        elif w.prompt is not None:
            if prompt_value is None:
                raise PromptRequiredError(
                    f"{col.name} needs a {w.prompt.field} date",
                    w.prompt.field,
                    w.prompt.input,
                )
            muts.append(cmd.SetField(w.prompt.field, prompt_value))
        return muts

    def move_task(
        self,
        board_id: str,
        uuid: str,
        to_column: str,
        expected_modified: str,
        prompt_value: str | None = None,
        index: int | None = None,
    ) -> Task:
        board = self._board(board_id)
        col = self._column(board, to_column)
        if col.read_only:
            raise ReadOnlyColumnError(f"column {col.name!r} is read-only")
        task = self._checked(uuid, expected_modified)
        muts = self._write_mutations(board, col, task, _parse_date(prompt_value))
        muts += self._rank_mutations(board, to_column, task, index, exclude_uuid=uuid)
        if not muts:
            return task
        return self.repo.apply(uuid, muts)

    def reorder_task(
        self, board_id: str, uuid: str, index: int, expected_modified: str
    ) -> Task:
        board = self._board(board_id)
        if board.ordering.mode != "manual":
            raise ValidationError("board uses computed ordering; reorder is not available")
        task = self._checked(uuid, expected_modified)
        column_id = None
        for col in board.columns:
            if self._matches(board, col, task):
                column_id = col.id
                break
        if column_id is None:
            raise ValidationError("task does not belong to any column on this board")
        muts = self._rank_mutations(board, column_id, task, index, exclude_uuid=uuid)
        if not muts:
            return task
        return self.repo.apply(uuid, muts)

    def _rank_mutations(
        self,
        board: BoardConfig,
        column_id: str,
        task: Task,
        index: int | None,
        exclude_uuid: str,
    ) -> list[cmd.TaskMutation]:
        if board.ordering.mode != "manual" or index is None:
            return []
        uda = board.ordering.rank_uda or ""
        tasks = self.repo.query(self._scope_filter(board))
        buckets, _ = self._classify(board, tasks)
        col_cfg = self._column(board, column_id)
        siblings = [
            t for t in self._sort(board, buckets[col_cfg.id]) if t.uuid != exclude_uuid
        ]
        index = max(0, min(index, len(siblings)))
        before = ranks.parse_rank(siblings[index - 1].rank_for(uda)) if index > 0 else None
        after = (
            ranks.parse_rank(siblings[index].rank_for(uda))
            if index < len(siblings)
            else None
        )
        new_rank = ranks.rank_between(before, after)
        if new_rank is not None:
            return [cmd.SetUda(uda, ranks.format_rank(new_rank))]
        ordered = siblings[:index] + [task] + siblings[index:]
        values = ranks.rebalanced(len(ordered))
        for sibling, value in zip(ordered, values, strict=True):
            if sibling.uuid != task.uuid:
                self.repo.apply(sibling.uuid, [cmd.SetUda(uda, ranks.format_rank(value))])
        my_value = values[index]
        return [cmd.SetUda(uda, ranks.format_rank(my_value))]

    def _checked(self, uuid: str, expected_modified: str) -> Task:
        task = self.repo.get(uuid)
        if task is None:
            raise NotFoundError(f"task {uuid} not found")
        actual = task.modified.isoformat() if task.modified else ""
        if expected_modified and expected_modified != actual:
            raise ConflictError("task changed elsewhere", task=task)
        return task


def _resolve_value(field: str, value: str) -> datetime | str | None:
    if field in ("due", "wait", "scheduled"):
        if value == "today":
            tz = server_timezone()
            now = datetime.now(tz)
            return now.replace(hour=23, minute=59, second=59, microsecond=0)
        return _parse_date(value)
    return value


def _parse_date(value) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    tz = server_timezone()
    try:
        if len(value) == 10:
            d = datetime.strptime(value, "%Y-%m-%d")
            return d.replace(hour=23, minute=59, second=59, tzinfo=tz)
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError(f"invalid date {value!r}") from exc


def _card(task: Task, board: BoardConfig, by_uuid: dict[str, Task]) -> dict:
    open_blockers = [
        d for d in task.depends if d in by_uuid and by_uuid[d].status in ("pending", "waiting")
    ]
    uda = board.ordering.rank_uda if board.ordering.mode == "manual" else None
    return {
        "uuid": task.uuid,
        "description": task.description,
        "status": task.status,
        "project": task.project,
        "tags": task.tags,
        "priority": task.priority,
        "due": task.due.isoformat() if task.due else None,
        "wait": task.wait.isoformat() if task.wait else None,
        "scheduled": task.scheduled.isoformat() if task.scheduled else None,
        "start": task.start.isoformat() if task.start else None,
        "entry": task.entry.isoformat() if task.entry else None,
        "modified": task.modified.isoformat() if task.modified else None,
        "end": task.end.isoformat() if task.end else None,
        "urgency": task.urgency,
        "active": task.active,
        "annotations": [
            {"entry": a.entry.isoformat(), "description": a.description}
            for a in task.annotations
        ],
        "depends": task.depends,
        "blocked_by_open": len(open_blockers),
        "rank": task.rank_for(uda) if uda else None,
        "udas": task.udas,
    }
