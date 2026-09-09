"""Taskwarrior CLI adapter.

Only used when SISYPHUS_REPOSITORY=cli is set explicitly; development defaults
to the fake repository so the real replica is never touched. Requires
SISYPHUS_TASKDATA and SISYPHUS_TASKRC to point at the replica it should own —
it refuses to run against the user's default ~/.task on purpose.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
from datetime import UTC, datetime

from ..domain import commands as cmd
from ..domain.errors import BackendError, ValidationError
from ..domain.task import Annotation, Task
from .port import SyncResult, TaskFilter

TIMEOUT_SECONDS = 10


class TaskwarriorCliRepository:
    def __init__(self):
        taskdata = os.environ.get("SISYPHUS_TASKDATA")
        taskrc = os.environ.get("SISYPHUS_TASKRC")
        if not taskdata or not taskrc:
            raise RuntimeError(
                "SISYPHUS_REPOSITORY=cli requires SISYPHUS_TASKDATA and SISYPHUS_TASKRC "
                "to be set explicitly; refusing to guess a Taskwarrior replica."
            )
        self._env = {
            **os.environ,
            "TASKDATA": taskdata,
            "TASKRC": taskrc,
            "LC_ALL": "C.UTF-8",
        }
        self._lock = threading.RLock()
        self.generation = 0
        self._last_sync: datetime | None = None
        self._sync_detail: str | None = None

    @property
    def last_sync(self) -> datetime | None:
        return self._last_sync

    @property
    def sync_detail(self) -> str | None:
        return self._sync_detail

    def _run(self, args: list[str], allow_fail: bool = False) -> subprocess.CompletedProcess:
        base = [
            "task",
            "rc.confirmation=off",
            "rc.recurrence.confirmation=no",
            "rc.bulk=0",
            "rc.verbose=nothing",
            "rc.hooks=on",
        ]
        try:
            proc = subprocess.run(
                base + args,
                env=self._env,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired as exc:
            raise BackendError(f"taskwarrior timed out running {args[:2]}") from exc
        if proc.returncode != 0 and not allow_fail:
            raise BackendError(
                f"taskwarrior failed ({proc.returncode}): {proc.stderr.strip()[:400]}"
            )
        return proc

    def sync(self) -> SyncResult:
        with self._lock:
            before = self._snapshot()
            proc = self._run(["sync"], allow_fail=True)
            ok = proc.returncode == 0
            now = datetime.now(UTC)
            if ok:
                self._last_sync = now
                self._sync_detail = None
                if self._snapshot() != before:
                    self.generation += 1
            else:
                self._sync_detail = proc.stderr.strip()[:400] or "sync failed"
            return SyncResult(ok=ok, at=now if ok else self._last_sync, detail=self._sync_detail)

    def _snapshot(self) -> str:
        proc = self._run(["status.not:deleted", "export"])
        rows = json.loads(proc.stdout or "[]")
        for row in rows:
            row.pop("id", None)
            row.pop("urgency", None)
        rows.sort(key=lambda row: row.get("uuid", ""))
        return json.dumps(rows, sort_keys=True, separators=(",", ":"))

    def query(self, filter: TaskFilter) -> list[Task]:
        with self._lock:
            args: list[str] = []
            status_expr = " or ".join(f"status:{s}" for s in filter.statuses)
            args.append(f"({status_expr})")
            if filter.project:
                if filter.include_descendants:
                    args.append(f"project:{filter.project}")
                else:
                    args.append(f"project.is:{filter.project}")
            proc = self._run(args + ["export"])
            rows = json.loads(proc.stdout or "[]")
            tasks = [self._parse(r) for r in rows]
            if filter.completed_after:
                tasks = [
                    t
                    for t in tasks
                    if t.status != "completed" or (t.end and t.end >= filter.completed_after)
                ]
            return tasks

    def get(self, uuid: str) -> Task | None:
        with self._lock:
            proc = self._run([uuid, "export"], allow_fail=True)
            rows = json.loads(proc.stdout or "[]")
            return self._parse(rows[0]) if rows else None

    def create(self, command: cmd.CreateTask) -> Task:
        with self._lock:
            args = ["add"]
            if command.project:
                args.append(f"project:{command.project}")
            if command.priority:
                args.append(f"priority:{command.priority}")
            if command.due:
                args.append(f"due:{command.due.isoformat()}")
            for tag in command.tags:
                args.append(f"+{tag}")
            for name, value in command.udas.items():
                args.append(f"{name}:{value}")
            if command.depends:
                args.append("depends:" + ",".join(command.depends))
            args += ["--", command.description]
            self._run(args)
            proc = self._run(["+LATEST", "export"])
            rows = json.loads(proc.stdout or "[]")
            if not rows:
                raise BackendError("created task could not be re-read")
            self.generation += 1
            task = self._parse(rows[0])
            if command.annotations:
                return self.apply(task.uuid, [cmd.Annotate(text) for text in command.annotations])
            return task

    def apply(self, uuid: str, mutations: list[cmd.TaskMutation]) -> Task:
        with self._lock:
            for m in mutations:
                self._apply_one(uuid, m)
            self.generation += 1
            task = self.get(uuid)
            if task is None:
                raise BackendError(f"task {uuid} vanished after mutation")
            return task

    def delete(self, uuid: str) -> None:
        with self._lock:
            self._run([uuid, "delete"])
            self.generation += 1

    def _apply_one(self, uuid: str, m: cmd.TaskMutation) -> None:
        def mod(*parts: str) -> None:
            self._run([uuid, "modify", *parts])

        match m:
            case cmd.SetField(name=name, value=value):
                if value is None or value == "":
                    mod(f"{name}:")
                elif isinstance(value, datetime):
                    mod(f"{name}:{value.isoformat()}")
                elif name == "description":
                    mod("--", str(value))
                else:
                    mod(f"{name}:{value}")
            case cmd.SetTags(tags=tags):
                current = self.get(uuid)
                old = set(current.tags) if current else set()
                new = set(tags)
                parts = [f"+{t}" for t in new - old] + [f"-{t}" for t in old - new]
                if parts:
                    mod(*parts)
            case cmd.AddTag(tag=tag):
                mod(f"+{tag}")
            case cmd.RemoveTag(tag=tag):
                mod(f"-{tag}")
            case cmd.SetStatus(status=status):
                mod(f"status:{status}")
            case cmd.Start():
                self._run([uuid, "start"])
            case cmd.Stop():
                # Native stop exits 1 when already stopped; policy transitions
                # deliberately stop defensively (block, defer, reopen, Ready).
                current = self.get(uuid)
                if current is not None and current.start is not None:
                    self._run([uuid, "stop"])
            case cmd.Complete():
                self._run([uuid, "done"])
            case cmd.Reopen():
                mod("status:pending", "end:", "start:")
            case cmd.Annotate(text=text):
                self._run([uuid, "annotate", "--", text])
            case cmd.SetDepends(uuids=uuids):
                mod("depends:" + ",".join(uuids) if uuids else "depends:")
            case cmd.SetUda(name=name, value=value):
                mod(f"{name}:{value if value is not None else ''}")
            case _:
                raise ValidationError(f"unsupported mutation {m!r}")

    KNOWN = {
        "uuid", "description", "status", "project", "tags", "priority", "due", "wait",
        "scheduled", "start", "entry", "modified", "end", "urgency", "annotations",
        "depends", "id", "imask", "mask", "parent", "recur",
    }

    def _parse(self, row: dict) -> Task:
        def ts(key: str) -> datetime | None:
            v = row.get(key)
            if not v:
                return None
            return datetime.strptime(v, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)

        depends = row.get("depends") or []
        if isinstance(depends, str):
            depends = [d for d in depends.split(",") if d]
        annotations = [
            Annotation(
                entry=datetime.strptime(a["entry"], "%Y%m%dT%H%M%SZ").replace(
                    tzinfo=UTC
                ),
                description=a["description"],
            )
            for a in row.get("annotations", [])
        ]
        udas = {
            k: str(v) for k, v in row.items() if k not in self.KNOWN and isinstance(v, (str, int, float))
        }
        return Task(
            uuid=row["uuid"],
            description=row.get("description", ""),
            status=row.get("status", "pending"),
            project=row.get("project"),
            tags=row.get("tags", []),
            priority=row.get("priority"),
            due=ts("due"),
            wait=ts("wait"),
            scheduled=ts("scheduled"),
            start=ts("start"),
            entry=ts("entry"),
            modified=ts("modified"),
            end=ts("end"),
            urgency=float(row.get("urgency", 0.0)),
            annotations=annotations,
            depends=depends,
            udas=udas,
            raw=row,
        )
