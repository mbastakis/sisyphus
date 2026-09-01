from __future__ import annotations

from ..domain import commands as cmd
from ..domain.errors import ConflictError, NotFoundError, ValidationError
from ..domain.task import Task
from ..repositories.port import TaskRepository
from .board_service import _parse_date


class TaskService:
    def __init__(self, repo: TaskRepository):
        self.repo = repo

    def get(self, uuid: str) -> Task:
        task = self.repo.get(uuid)
        if task is None:
            raise NotFoundError(f"task {uuid} not found")
        return task

    def _checked(self, uuid: str, expected_modified: str) -> Task:
        task = self.get(uuid)
        actual = task.modified.isoformat() if task.modified else ""
        if expected_modified and expected_modified != actual:
            raise ConflictError("task changed elsewhere", task=task)
        return task

    def patch(self, uuid: str, expected_modified: str, changes: dict) -> Task:
        self._checked(uuid, expected_modified)
        muts: list[cmd.TaskMutation] = []
        for field, value in changes.items():
            match field:
                case "description":
                    if not (value or "").strip():
                        raise ValidationError("description cannot be empty")
                    muts.append(cmd.SetField("description", value.strip()))
                case "project" | "priority":
                    muts.append(cmd.SetField(field, value or None))
                case "due" | "wait" | "scheduled":
                    muts.append(cmd.SetField(field, _parse_date(value)))
                case "tags":
                    if not isinstance(value, list):
                        raise ValidationError("tags must be a list")
                    muts.append(cmd.SetTags([str(t).strip() for t in value if str(t).strip()]))
                case "depends":
                    if not isinstance(value, list):
                        raise ValidationError("depends must be a list")
                    muts.append(cmd.SetDepends(value))
                case _:
                    raise ValidationError(f"cannot patch field {field!r}")
        if not muts:
            return self.get(uuid)
        return self.repo.apply(uuid, muts)

    def lifecycle(self, uuid: str, expected_modified: str, action: str) -> Task:
        self._checked(uuid, expected_modified)
        mapping: dict[str, cmd.TaskMutation] = {
            "complete": cmd.Complete(),
            "reopen": cmd.Reopen(),
            "start": cmd.Start(),
            "stop": cmd.Stop(),
        }
        if action not in mapping:
            raise ValidationError(f"unknown lifecycle action {action!r}")
        return self.repo.apply(uuid, [mapping[action]])

    def annotate(self, uuid: str, text: str) -> Task:
        if not (text or "").strip():
            raise ValidationError("annotation text is required")
        self.get(uuid)
        return self.repo.apply(uuid, [cmd.Annotate(text.strip())])

    def delete(self, uuid: str, expected_modified: str) -> None:
        self._checked(uuid, expected_modified)
        self.repo.delete(uuid)


def task_detail(task: Task) -> dict:
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
        "blocked_by_open": 0,
        "rank": None,
        "udas": task.udas,
    }
