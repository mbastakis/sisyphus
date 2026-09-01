from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
UDA_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

Preset = Literal["backlog", "ready", "doing", "waiting", "done"]


class ScopeConfig(BaseModel):
    filter: str | None = None
    project: str | None = None
    include_descendants: bool = True
    completed_days: int = 14


class MatchConfig(BaseModel):
    preset: Preset | None = None
    filter: str | None = None

    @model_validator(mode="after")
    def _one_of(self):
        if (self.preset is None) == (self.filter is None):
            raise ValueError("match requires exactly one of preset or filter")
        return self


class PromptConfig(BaseModel):
    field: Literal["due", "wait", "scheduled"]
    input: Literal["date"] = "date"


class WriteConfig(BaseModel):
    preset: Preset | None = None
    set: dict[str, str] | None = None
    clear: list[str] | None = None
    prompt: PromptConfig | None = None

    @model_validator(mode="after")
    def _one_of(self):
        given = [x is not None for x in (self.preset, self.set, self.clear, self.prompt)]
        if sum(given) != 1:
            raise ValueError("write requires exactly one of preset, set, clear, prompt")
        return self


class ColumnConfig(BaseModel):
    id: str
    name: str
    match: MatchConfig
    write: WriteConfig | None = None
    wip_limit: int | None = None

    @field_validator("id")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError(f"column id {v!r} is not a valid slug")
        return v

    @property
    def read_only(self) -> bool:
        return self.write is None


class OrderBy(BaseModel):
    field: str
    direction: Literal["asc", "desc"] = "asc"


class OrderingConfig(BaseModel):
    mode: Literal["manual", "computed"] = "computed"
    rank_uda: str | None = None
    by: list[dict[str, str]] = Field(default_factory=list)
    fallback: list[dict[str, str]] = Field(default_factory=list)

    @model_validator(mode="after")
    def _rank_required(self):
        if self.mode == "manual":
            if not self.rank_uda:
                raise ValueError("manual ordering requires rank_uda")
            if not UDA_RE.match(self.rank_uda):
                raise ValueError(f"rank_uda {self.rank_uda!r} is not a valid UDA name")
        return self

    def keys(self) -> list[tuple[str, str]]:
        source = self.by if self.mode == "computed" else self.fallback
        out = [(k, v) for entry in source for k, v in entry.items()]
        if not out:
            out = [("urgency", "desc"), ("entry", "asc")]
        return out


class CardsConfig(BaseModel):
    fields: list[str] = Field(
        default_factory=lambda: ["project", "priority", "due", "blockers", "first_tag"]
    )


class MobileConfig(BaseModel):
    default_column: str | None = None


class BoardConfig(BaseModel):
    id: str
    name: str
    description: str | None = None
    template: Literal["lifecycle", "project-lifecycle", "daily", "custom"] = "custom"
    scope: ScopeConfig = Field(default_factory=ScopeConfig)
    ordering: OrderingConfig = Field(default_factory=OrderingConfig)
    cards: CardsConfig = Field(default_factory=CardsConfig)
    mobile: MobileConfig = Field(default_factory=MobileConfig)
    ready_tag: str = "ready"
    columns: list[ColumnConfig] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError(f"board id {v!r} is not a valid slug")
        return v

    @model_validator(mode="after")
    def _expand_template(self):
        if not self.columns:
            if self.template in ("lifecycle", "project-lifecycle"):
                self.columns = _lifecycle_columns()
            else:
                raise ValueError(f"board {self.id!r} defines no columns")
        seen: set[str] = set()
        for col in self.columns:
            if col.id in seen:
                raise ValueError(f"board {self.id!r} has duplicate column id {col.id!r}")
            seen.add(col.id)
        return self


def _lifecycle_columns() -> list[ColumnConfig]:
    cols = []
    for cid, name in [
        ("backlog", "Backlog"),
        ("ready", "Ready"),
        ("doing", "Doing"),
        ("waiting", "Waiting"),
        ("done", "Done"),
    ]:
        cols.append(
            ColumnConfig(
                id=cid,
                name=name,
                match=MatchConfig(preset=cid),  # type: ignore[arg-type]
                write=WriteConfig(preset=cid),  # type: ignore[arg-type]
            )
        )
    return cols


class AppConfig(BaseModel):
    version: int
    boards: list[BoardConfig]

    @model_validator(mode="after")
    def _validate(self):
        if self.version != 1:
            raise ValueError("unsupported configuration version")
        ids: set[str] = set()
        udas: set[str] = set()
        for b in self.boards:
            if b.id in ids:
                raise ValueError(f"duplicate board id {b.id!r}")
            ids.add(b.id)
            if b.ordering.mode == "manual":
                uda = b.ordering.rank_uda
                if uda in udas:
                    raise ValueError(f"rank_uda {uda!r} is used by more than one board")
                udas.add(uda)  # type: ignore[arg-type]
        return self

    def board(self, board_id: str) -> BoardConfig | None:
        for b in self.boards:
            if b.id == board_id:
                return b
        return None
