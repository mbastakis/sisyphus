"""In-memory Taskwarrior stand-in for safe development.

Selected by SISYPHUS_REPOSITORY=fake (the default). Never touches the real
Taskwarrior replica. Seeds a believable task universe relative to today so
every board column has content.
"""

from __future__ import annotations

import threading
import uuid as uuidlib
from datetime import UTC, datetime, timedelta

from ..domain import commands as cmd
from ..domain.errors import NotFoundError, ValidationError
from ..domain.task import Annotation, Task, server_timezone
from .port import SyncResult, TaskFilter


def _now() -> datetime:
    return datetime.now(UTC)


class FakeTaskRepository:
    def __init__(self, seed: bool = True):
        self._tasks: dict[str, Task] = {}
        self._lock = threading.RLock()
        self.generation = 0
        self._last_sync: datetime | None = None
        if seed:
            self._seed()

    # -- port implementation -------------------------------------------------

    def sync(self) -> SyncResult:
        with self._lock:
            self._last_sync = _now()
            return SyncResult(ok=True, at=self._last_sync, detail="fake repository (no-op)")

    @property
    def last_sync(self) -> datetime | None:
        return self._last_sync

    @property
    def sync_detail(self) -> str | None:
        return None

    def query(self, filter: TaskFilter) -> list[Task]:
        with self._lock:
            out = []
            for t in self._tasks.values():
                if t.status == "deleted":
                    continue
                if t.status not in filter.statuses:
                    continue
                if (
                    t.status == "completed"
                    and filter.completed_after
                    and (not t.end or t.end < filter.completed_after)
                ):
                    continue
                if filter.project:
                    if not t.project:
                        continue
                    if filter.include_descendants:
                        if not (
                            t.project == filter.project
                            or t.project.startswith(filter.project + ".")
                        ):
                            continue
                    elif t.project != filter.project:
                        continue
                out.append(t)
            return out

    def get(self, uuid: str) -> Task | None:
        with self._lock:
            t = self._tasks.get(uuid)
            return None if t is None or t.status == "deleted" else t

    def create(self, command: cmd.CreateTask) -> Task:
        with self._lock:
            now = _now()
            task = Task(
                uuid=str(uuidlib.uuid4()),
                description=command.description,
                status="pending",
                project=command.project,
                tags=list(command.tags),
                priority=command.priority,
                due=command.due,
                entry=now,
                modified=now,
            )
            task.urgency = _urgency(task)
            self._tasks[task.uuid] = task
            self.generation += 1
            return task

    def apply(self, uuid: str, mutations: list[cmd.TaskMutation]) -> Task:
        with self._lock:
            task = self.get(uuid)
            if task is None:
                raise NotFoundError(f"task {uuid} not found")
            for m in mutations:
                self._apply_one(task, m)
            task.modified = _now()
            task.urgency = _urgency(task)
            self.generation += 1
            return task

    def delete(self, uuid: str) -> None:
        with self._lock:
            task = self.get(uuid)
            if task is None:
                raise NotFoundError(f"task {uuid} not found")
            task.status = "deleted"
            task.end = _now()
            task.modified = _now()
            self.generation += 1

    # -- mutation application ------------------------------------------------

    def _apply_one(self, task: Task, m: cmd.TaskMutation) -> None:
        now = _now()
        match m:
            case cmd.SetField(name=name, value=value):
                if name not in ("project", "priority", "due", "wait", "scheduled", "description"):
                    raise ValidationError(f"cannot set field {name!r}")
                setattr(task, name, value if value != "" else None)
                if name == "wait":
                    if value and isinstance(value, datetime) and value > now:
                        task.status = "waiting"
                    elif task.status == "waiting":
                        task.status = "pending"
            case cmd.SetTags(tags=tags):
                task.tags = list(dict.fromkeys(tags))
            case cmd.AddTag(tag=tag):
                if tag not in task.tags:
                    task.tags.append(tag)
            case cmd.RemoveTag(tag=tag):
                if tag in task.tags:
                    task.tags.remove(tag)
            case cmd.SetStatus(status=status):
                task.status = status
            case cmd.Start():
                if task.status != "pending":
                    task.status = "pending"
                    task.end = None
                task.start = now
            case cmd.Stop():
                task.start = None
            case cmd.Complete():
                task.status = "completed"
                task.start = None
                task.end = now
            case cmd.Reopen():
                task.status = "pending"
                task.end = None
            case cmd.Annotate(text=text):
                task.annotations.append(Annotation(entry=now, description=text))
            case cmd.SetDepends(uuids=uuids):
                unknown = [u for u in uuids if u not in self._tasks]
                if unknown:
                    raise ValidationError(f"unknown dependencies: {unknown}")
                task.depends = list(dict.fromkeys(uuids))
            case cmd.SetUda(name=name, value=value):
                if value is None:
                    task.udas.pop(name, None)
                else:
                    task.udas[name] = value
            case _:
                raise ValidationError(f"unsupported mutation {m!r}")

    # -- seed data -----------------------------------------------------------

    def _seed(self) -> None:
        tz = server_timezone()
        today = datetime.now(tz).replace(hour=18, minute=0, second=0, microsecond=0)

        def day(offset: int) -> datetime:
            return (today + timedelta(days=offset)).astimezone(UTC)

        rank_counter = {"lifecycle": 0, "home": 0}

        def add(
            desc: str,
            *,
            project: str | None = None,
            tags: list[str] | None = None,
            priority: str | None = None,
            due: int | None = None,
            wait: int | None = None,
            status: str = "pending",
            started: bool = False,
            done_days_ago: int | None = None,
            age_days: int = 10,
            annotations: list[str] | None = None,
        ) -> Task:
            now = _now()
            t = Task(
                uuid=str(uuidlib.uuid4()),
                description=desc,
                status=status,
                project=project,
                tags=list(tags or []),
                priority=priority,
                due=day(due) if due is not None else None,
                wait=day(wait) if wait is not None else None,
                entry=now - timedelta(days=age_days),
                modified=now - timedelta(hours=age_days),
            )
            if started:
                t.start = now - timedelta(hours=3)
            if done_days_ago is not None:
                t.status = "completed"
                t.end = now - timedelta(days=done_days_ago)
            for a in annotations or []:
                t.annotations.append(
                    Annotation(entry=now - timedelta(days=1), description=a)
                )
            rank_counter["lifecycle"] += 1
            t.udas["sisyphus_rank_lifecycle"] = f"{rank_counter['lifecycle'] * 1024:012d}"
            if project and (project == "home" or project.startswith("home.")):
                rank_counter["home"] += 1
                t.udas["sisyphus_rank_project_home"] = f"{rank_counter['home'] * 1024:012d}"
            t.urgency = _urgency(t)
            self._tasks[t.uuid] = t
            return t

        # Doing
        add("Wire the taskwarrior CLI adapter behind the repository port",
            project="work.sisyphus", tags=["ready", "deep"], priority="H", due=1,
            started=True, age_days=6,
            annotations=["Blocked on deciding subprocess timeout policy — resolved: 10s."])
        add("Prune the tomato plants before the heat wave",
            project="home.garden", tags=["outdoor"], priority="M", due=0, started=True, age_days=2)

        # Ready
        add("Write contract tests for the board projection DTO",
            project="work.sisyphus", tags=["ready", "tests"], priority="M", due=2, age_days=4)
        add("Replace the kitchen tap washer", project="home", tags=["ready", "diy"],
            priority="L", age_days=21)
        add("Renew the domain registration", project="personal.admin",
            tags=["ready"], priority="H", due=3, age_days=30)
        add("Sharpen the chef's knife", project="home.kitchen", tags=["ready"], age_days=8)

        # Backlog
        blocked_parent = add("Order raised-bed soil and compost",
                             project="home.garden", tags=["outdoor"], due=6, age_days=12)
        blocked = add("Plant the autumn spinach and kale",
                      project="home.garden", tags=["outdoor"], priority="M", due=9, age_days=12)
        blocked.depends = [blocked_parent.uuid]
        add("Read the TaskChampion sync protocol notes", project="work.sisyphus",
            tags=["reading"], age_days=15)
        add("Digitize the old photo albums", project="personal", age_days=90)
        add("Research e-ink dashboards for the hallway", project="home", tags=["someday"],
            age_days=45)
        add("Book dentist appointment", project="personal.health", priority="M", due=-2,
            age_days=20, annotations=["Dr. Papadopoulos is on leave until Monday."])
        add("Fix the squeaky bedroom door hinge", project="home", tags=["diy"], age_days=33)
        add("Draft the September meal plan", project="home.kitchen", due=4, age_days=3)
        add("Update the router firmware", project="home.lab", priority="M", due=-1, age_days=9,
            annotations=["Changelog mentions a WPA3 fix."])
        add("Write ADR for the undo contract", project="work.sisyphus", tags=["writing"],
            due=5, age_days=2)
        add("Take the winter coats to the cleaner", project="home", age_days=5)

        # Waiting
        add("Chase the landlord about the balcony leak", project="home",
            status="waiting", wait=7, age_days=18,
            annotations=["Emailed on the 25th; said he'd reply within two weeks."])
        add("Pick up the framed print when the shop calls", project="personal",
            status="waiting", wait=3, age_days=11)
        add("Review Mend Renovate PRs once enabled", project="work.kavouki",
            status="waiting", wait=14, age_days=8)

        # Done (recent)
        add("Ship the Nocturne Rose contrast audit", project="work.sisyphus",
            tags=["design"], done_days_ago=1, age_days=7)
        add("Water and feed the citrus pots", project="home.garden", done_days_ago=2, age_days=4)
        add("Migrate Kavouki state to committed encrypted files", project="work.kavouki",
            done_days_ago=5, age_days=40)
        add("Descale the espresso machine", project="home.kitchen", done_days_ago=9, age_days=14)

        self.sync()


def _urgency(t: Task) -> float:
    if t.status == "completed":
        return 0.0
    u = 0.0
    if t.priority == "H":
        u += 6.0
    elif t.priority == "M":
        u += 3.9
    elif t.priority == "L":
        u += 1.8
    if t.active:
        u += 4.0
    if t.due:
        days = (t.due - _now()).total_seconds() / 86400
        if days < 0:
            u += 12.0
        elif days < 7:
            u += 12.0 * (1 - days / 7) * 0.8
    if t.tags:
        u += 0.8
    if t.project:
        u += 1.0
    if t.entry:
        age_days = (_now() - t.entry).total_seconds() / 86400
        u += min(age_days / 365, 1.0) * 2.0
    if t.status == "waiting":
        u -= 3.0
    return round(u, 3)
