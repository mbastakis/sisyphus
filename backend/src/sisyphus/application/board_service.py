from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..config.models import (
    PROJECT_BOARD_PREFIX,
    AppConfig,
    BoardConfig,
    ColumnConfig,
    project_board,
    project_board_id,
)
from ..domain import commands as cmd
from ..domain import policy
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

# Retention for ordinary Done columns; project discovery and history are all-age.
PROJECT_COMPLETED_DAYS = 14


class BoardService:
    def __init__(self, config: AppConfig, repo: TaskRepository):
        self.config = config
        self.repo = repo

    def universe(self) -> dict[str, Task]:
        return {t.uuid: t for t in self.repo.query(TaskFilter(
            statuses=["pending", "waiting", "completed", "deleted", "recurring"]
        ))}

    def card(self, task: Task, board_id: str) -> dict:
        return _card(task, self.board(board_id), self.universe())

    # -- projection ----------------------------------------------------------

    def list_boards(self) -> list[dict]:
        """Core boards followed by one board per exact project in use.

        Project discovery includes all unfinished tasks, recurring templates,
        and completions of any age. Deleted-only projects are omitted.
        """
        universe = self.universe()
        core_counts = self._counts(list(universe.values()), universe)
        out = [
            {
                "id": b.id,
                "name": b.name,
                "description": b.description,
                "kind": "static",
                "project": b.scope.project,
                "open_count": None,
                "group": None,
                **core_counts,
            }
            for b in self.config.boards
        ]
        for project, counts in sorted(self._project_index().items()):
            open_count = counts["unfinished_count"]
            out.append(
                {
                    "id": project_board_id(project),
                    "name": project,
                    "description": f"{open_count} open" if open_count else "nothing open",
                    "kind": "project",
                    "project": project,
                    "open_count": open_count,
                    **counts,
                }
            )
        return out

    def _project_index(self) -> dict[str, dict]:
        """Exact projects that currently deserve a board, with task counts."""
        universe = self.universe()
        projects: dict[str, list[Task]] = {}
        for task in universe.values():
            project = (task.project or "").strip()
            if not project or task.status == "deleted":
                continue
            projects.setdefault(project, []).append(task)
        return {project: self._counts(tasks, universe, grouped=True)
                for project, tasks in projects.items()}

    def _counts(self, tasks: list[Task], universe: dict[str, Task], grouped=False) -> dict:
        states = [(t, policy.describe(t, universe, datetime.now(UTC))) for t in tasks]
        unfinished = [(t, s) for t, s in states if t.status in ("pending", "waiting", "recurring")]
        committed = sum(s["lifecycle"] in ("ready", "doing", "waiting")
                        and not s["deferred"] for _, s in unfinished)
        waits = [t.wait for t, s in unfinished if s["deferred"]]
        ends = [t.end for t in tasks if t.status == "completed" and t.end]
        result = {
            "committed_count": committed, "unfinished_count": len(unfinished),
            "backlog_count": sum(s["lifecycle"] == "backlog" and not s["deferred"] for _, s in unfinished),
            "deferred_count": len(waits), "next_deferred_until": min(waits).isoformat() if waits else None,
            "last_completed_at": max(ends).isoformat() if ends else None,
        }
        if grouped:
            result["group"] = "active" if committed else "later" if unfinished else "history"
        return result

    def board(self, board_id: str) -> BoardConfig:
        """Resolve a static or dynamic board id, or raise NotFoundError."""
        return self._board(board_id)

    def _board(self, board_id: str) -> BoardConfig:
        board = self.config.board(board_id)
        if board is not None:
            return board
        if board_id.startswith(PROJECT_BOARD_PREFIX):
            project = board_id[len(PROJECT_BOARD_PREFIX):].strip()
            if project and project in self._project_index():
                return project_board(project, self.config.ready_tag, PROJECT_COMPLETED_DAYS)
        raise NotFoundError(f"board {board_id!r} not found")

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
        if board.template in ("lifecycle", "project-lifecycle", "daily") and "completed" not in statuses:
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

    def _matches(self, board: BoardConfig, col: ColumnConfig, task: Task,
                 universe: dict[str, Task] | None = None) -> bool:
        m = col.match
        if m.preset:
            state = policy.describe(task, universe if universe is not None else self.universe(), datetime.now(UTC))
            return not state["deferred"] and state["lifecycle"] == m.preset
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
        universe = self.universe()
        for task in tasks:
            if policy.describe(task, universe, datetime.now(UTC))["deferred"]:
                continue
            for col in board.columns:
                if self._matches(board, col, task, universe):
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

    def projection(self, board_id: str, history: bool = False) -> dict:
        board = self._board(board_id)
        scope = self._scope_filter(board)
        if history:
            scope.statuses = ["completed"]
            scope.completed_after = None
            if board.template == "daily":
                from ..config.models import _lifecycle_columns
                board = board.model_copy(update={"columns": _lifecycle_columns()})
        tasks = self.repo.query(scope)
        by_uuid = self.universe()
        buckets, unmapped = self._classify(board, tasks)
        if board.template == "daily" and not history:
            unmapped = 0
        columns = []
        for col in board.columns:
            cards = self._sort(board, buckets[col.id])
            if history:
                cards = sorted(cards, key=lambda t: t.end or datetime.min.replace(tzinfo=UTC), reverse=True)
            prompt = None
            if col.write and col.write.prompt:
                prompt = col.write.prompt.model_dump()
            elif col.write and col.write.preset == "waiting":
                prompt = {"field": "blocker", "input": "text"}
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
        today = {key: [] for key in ("attention", "doing", "chosen", "unfinished_plans", "ready_pool", "done_today")}
        deferred = []
        for task in self._sort(board, tasks):
            card = _card(task, board, by_uuid)
            if card["deferred"] and not history:
                deferred.append(card)
                if board.template == "daily" and set(card["attention_reasons"]) & {"due_today", "overdue"}:
                    today["attention"].append(card)
            elif board.template == "daily" and not history:
                if task.status == "completed":
                    if task.end and local_date(task.end) == local_today():
                        today["done_today"].append(card)
                elif card["lifecycle"] == "doing":
                    today["doing"].append(card)
                elif card["lifecycle"] == "ready" and card["planned_for"] == local_today().isoformat():
                    today["chosen"].append(card)
                elif set(card["attention_reasons"]) - {"unfinished_plan"}:
                    today["attention"].append(card)
                elif "unfinished_plan" in card["attention_reasons"]:
                    today["unfinished_plans"].append(card)
                elif card["lifecycle"] == "ready":
                    key = "chosen" if card["planned_for"] == local_today().isoformat() else "ready_pool"
                    today[key].append(card)
        today["done_today"].sort(key=lambda c: c["end"] or "", reverse=True)
        return {
            "board": {
                "id": board.id,
                "name": board.name,
                "description": board.description,
                "ordering_mode": board.ordering.mode,
                "mobile_default_column": board.mobile.default_column,
                "ready_tag": board.ready_tag,
                "kind": "project" if board.is_project_board else "static",
                "project": board.scope.project,
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
            "view": "today" if board.template == "daily" and not history else "kanban",
            "today": today,
            "deferred": deferred,
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
        if payload.get("priority") not in (None, "", "H", "M", "L"):
            raise ValidationError("priority must be H, M, L or null")
        universe = self.universe()
        dependencies = payload.get("dependencies") or []
        policy.validate_dependencies(dependencies, universe)
        annotations = payload.get("annotations") or []
        if any(not text.strip() for text in annotations):
            raise ValidationError("annotations cannot be blank")
        planned = policy.midnight(payload.get("planned_for"))
        followup = policy.midnight(payload.get("follow_up_on"))
        blocker = (payload.get("blocker") or "").strip() or None
        if followup and not (blocker or dependencies):
            raise ValidationError("follow-up requires a blocker or dependency")
        udas = {}
        if blocker:
            udas[policy.BLOCKER] = blocker
        if followup:
            udas[policy.FOLLOWUP] = followup.isoformat()
        if planned:
            if blocker or dependencies:
                raise ValidationError("blocked tasks cannot be planned")
            udas[policy.PLAN] = planned.isoformat()
        draft = Task(uuid="new", description=description, status="pending",
                     tags=["next"] if planned else [], depends=dependencies, udas=udas)
        mutations: list[cmd.TaskMutation] = []
        column_id = payload.get("column_id")
        if planned and column_id == "backlog":
            raise ValidationError("a planned task is committed; choose Ready or remove the plan")
        if column_id:
            creation_board = board
            if board.template == "daily":
                from ..config.models import _lifecycle_columns
                creation_board = board.model_copy(update={"columns": _lifecycle_columns()})
            col = self._column(creation_board, column_id)
            if col.read_only:
                raise ReadOnlyColumnError(f"column {col.name!r} is read-only")
            mutations = self._write_mutations(board, col, draft, payload.get("prompt_value"))
        # Validate the full intent before the first persistence operation.
        task = self.repo.create(
            cmd.CreateTask(
                description=description,
                project=project,
                tags=draft.tags,
                priority=payload.get("priority") or None,
                due=due,
                udas=udas,
                depends=dependencies,
                annotations=annotations,
            )
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
        prompt_value: str | None,
    ) -> list[cmd.TaskMutation]:
        assert col.write is not None
        w = col.write
        if w.preset:
            from dataclasses import replace

            action = {"doing": "start", "done": "complete", "waiting": "block"}.get(w.preset, w.preset)
            if action == "block" and not (prompt_value or "").strip():
                raise PromptRequiredError("Waiting needs a specific blocker", "blocker", "text")
            universe = self.universe()
            prefix = []
            if task.status == "completed" and action != "complete":
                prefix = [cmd.Reopen(), cmd.Stop()]
                task = replace(task, status="pending", start=None)
            if w.preset == "waiting":
                prefix.append(cmd.AddTag("next"))
                task = replace(task, tags=list(dict.fromkeys([*task.tags, "next"])))
            return prefix + policy.transition(task, universe, datetime.now(UTC), action, blocker=prompt_value)
        raise ValidationError("date-writing board moves are no longer supported")

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
        muts = self._write_mutations(board, col, task, prompt_value)
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
        if not expected_modified:
            raise ValidationError("expected_modified is required")
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
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=tz)
    except (ValueError, TypeError) as exc:
        raise ValidationError(f"invalid date {value!r}") from exc


def _card(task: Task, board: BoardConfig, by_uuid: dict[str, Task]) -> dict:
    state = policy.describe(task, by_uuid, datetime.now(UTC))
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
        "blocked_by_open": len(state["open_dependencies"]),
        "rank": task.rank_for(uda) if uda else None,
        "udas": task.udas,
        **state,
    }
