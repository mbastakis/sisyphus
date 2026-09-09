from __future__ import annotations

from datetime import UTC, datetime

from ..config.models import project_board
from ..domain import commands as cmd
from ..domain import policy
from ..domain.errors import ConflictError, NotFoundError, ValidationError
from ..domain.task import Task
from ..repositories.port import TaskFilter, TaskRepository
from .board_service import _card, _parse_date


class TaskService:
    def __init__(self, repo: TaskRepository):
        self.repo = repo

    def universe(self) -> dict[str, Task]:
        return {t.uuid: t for t in self.repo.query(TaskFilter(
            statuses=["pending", "waiting", "completed", "deleted", "recurring"]
        ))}

    def detail(self, task: Task) -> dict:
        return task_detail(task, self.universe())

    def get(self, uuid: str) -> Task:
        task = self.repo.get(uuid)
        if task is None:
            raise NotFoundError(f"task {uuid} not found")
        return task

    def _checked(self, uuid: str, expected_modified: str) -> Task:
        if not expected_modified:
            raise ValidationError("expected_modified is required")
        task = self.get(uuid)
        actual = task.modified.isoformat() if task.modified else ""
        if expected_modified and expected_modified != actual:
            raise ConflictError("task changed elsewhere", task=task)
        return task

    def patch(self, uuid: str, expected_modified: str, changes: dict) -> Task:
        task = self._checked(uuid, expected_modified)
        muts: list[cmd.TaskMutation] = []
        for field, value in changes.items():
            if field in ("description", "project", "priority", "due") and value is not None and not isinstance(value, str):
                raise ValidationError(f"{field} must be a string or null")
            match field:
                case "description":
                    if not (value or "").strip():
                        raise ValidationError("description cannot be empty")
                    muts.append(cmd.SetField("description", value.strip()))
                case "project" | "priority":
                    if field == "priority" and value not in (None, "", "H", "M", "L"):
                        raise ValidationError("priority must be H, M, L or null")
                    muts.append(cmd.SetField(field, value or None))
                case "due":
                    muts.append(cmd.SetField(field, _parse_date(value)))
                case "tags":
                    raise ValidationError(
                        "tags are managed by boards; move the task between columns instead"
                    )
                case "depends":
                    if not isinstance(value, list):
                        raise ValidationError("depends must be a list")
                    policy.validate_dependencies(value, self.universe(), uuid)
                    muts.append(cmd.SetDepends(value))
                    if value and task.start:
                        muts.extend([cmd.AddTag("next"), cmd.Stop()])
                case _:
                    raise ValidationError(f"cannot patch field {field!r}")
        if not muts:
            return self.get(uuid)
        return self.repo.apply(uuid, muts)

    def lifecycle(self, uuid: str, expected_modified: str, action: str) -> Task:
        return self.action(uuid, expected_modified, action)

    def action(self, uuid: str, expected_modified: str, action: str,
               date: str | None = None, blocker: str | None = None) -> Task:
        task = self._checked(uuid, expected_modified)
        mutations = policy.transition(task, self.universe(), datetime.now(UTC), action,
                                      date=date, blocker=blocker)
        return self.repo.apply(uuid, mutations)

    def annotate(self, uuid: str, text: str) -> Task:
        if not (text or "").strip():
            raise ValidationError("annotation text is required")
        self.get(uuid)
        return self.repo.apply(uuid, [cmd.Annotate(text.strip())])

    def delete(self, uuid: str, expected_modified: str) -> None:
        self._checked(uuid, expected_modified)
        self.repo.delete(uuid)


def task_detail(task: Task, universe: dict[str, Task] | None = None) -> dict:
    card = _card(task, project_board(task.project or "", "next"), universe or {task.uuid: task})
    card["rank"] = None
    return card
