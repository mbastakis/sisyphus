from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

from ..domain.commands import CreateTask, TaskMutation
from ..domain.task import Task


@dataclass
class TaskFilter:
    statuses: list[str] = field(default_factory=lambda: ["pending", "waiting"])
    project: str | None = None
    include_descendants: bool = True
    completed_after: datetime | None = None


@dataclass
class SyncResult:
    ok: bool
    detail: str | None = None
    at: datetime | None = None


class TaskRepository(Protocol):
    generation: int

    def sync(self) -> SyncResult: ...
    def query(self, filter: TaskFilter) -> list[Task]: ...
    def get(self, uuid: str) -> Task | None: ...
    def create(self, command: CreateTask) -> Task: ...
    def apply(self, uuid: str, mutations: list[TaskMutation]) -> Task: ...
    def delete(self, uuid: str) -> None: ...
