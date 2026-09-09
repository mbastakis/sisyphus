from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class SetField:
    name: str  # project | priority | due | wait | scheduled | description
    value: str | datetime | None


@dataclass
class SetTags:
    tags: list[str]


@dataclass
class AddTag:
    tag: str


@dataclass
class RemoveTag:
    tag: str


@dataclass
class SetStatus:
    status: str  # pending | waiting


@dataclass
class Start:
    pass


@dataclass
class Stop:
    pass


@dataclass
class Complete:
    pass


@dataclass
class Reopen:
    pass


@dataclass
class Annotate:
    text: str


@dataclass
class SetDepends:
    uuids: list[str]


@dataclass
class SetUda:
    name: str
    value: str | None


TaskMutation = (
    SetField
    | SetTags
    | AddTag
    | RemoveTag
    | SetStatus
    | Start
    | Stop
    | Complete
    | Reopen
    | Annotate
    | SetDepends
    | SetUda
)


@dataclass
class CreateTask:
    description: str
    project: str | None = None
    tags: list[str] = field(default_factory=list)
    priority: str | None = None
    due: datetime | None = None
    udas: dict[str, str] = field(default_factory=dict)
    depends: list[str] = field(default_factory=list)
    annotations: list[str] = field(default_factory=list)
