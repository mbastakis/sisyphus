from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo


def server_timezone() -> ZoneInfo:
    tz = os.environ.get("TZ")
    if tz:
        return ZoneInfo(tz)
    localname = time.tzname[0]
    try:
        return ZoneInfo(localname)
    except Exception:
        return ZoneInfo("UTC")


def local_date(dt: datetime) -> date:
    return dt.astimezone(server_timezone()).date()


def local_today() -> date:
    return datetime.now(server_timezone()).date()


@dataclass
class Annotation:
    entry: datetime
    description: str


@dataclass
class Task:
    uuid: str
    description: str
    status: str  # pending | waiting | completed | deleted
    project: str | None = None
    tags: list[str] = field(default_factory=list)
    priority: str | None = None  # H | M | L
    due: datetime | None = None
    wait: datetime | None = None
    scheduled: datetime | None = None
    start: datetime | None = None
    entry: datetime | None = None
    modified: datetime | None = None
    end: datetime | None = None
    urgency: float = 0.0
    annotations: list[Annotation] = field(default_factory=list)
    depends: list[str] = field(default_factory=list)
    udas: dict[str, str] = field(default_factory=dict)
    raw: dict = field(default_factory=dict)

    @property
    def active(self) -> bool:
        return self.status == "pending" and self.start is not None

    def rank_for(self, rank_uda: str) -> str | None:
        return self.udas.get(rank_uda)
