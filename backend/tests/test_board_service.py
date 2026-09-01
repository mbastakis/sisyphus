from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from sisyphus.application.board_service import BoardService
from sisyphus.config.loader import load_config
from sisyphus.domain import commands as cmd
from sisyphus.domain.errors import (
    ConflictError,
    PromptRequiredError,
    ReadOnlyColumnError,
)
from sisyphus.repositories.fake import FakeTaskRepository

CONFIG = Path(__file__).resolve().parents[2] / "config" / "boards.yaml"


@pytest.fixture()
def svc() -> BoardService:
    return BoardService(load_config(CONFIG), FakeTaskRepository(seed=False))


def make(svc: BoardService, description: str, **kwargs):
    task = svc.repo.create(cmd.CreateTask(description=description))
    muts = []
    for field in ("due", "wait"):
        if field in kwargs:
            muts.append(cmd.SetField(field, kwargs[field]))
    if kwargs.get("ready"):
        muts.append(cmd.AddTag("ready"))
    if kwargs.get("started"):
        muts.append(cmd.Start())
    if kwargs.get("completed"):
        muts.append(cmd.Complete())
    if muts:
        task = svc.repo.apply(task.uuid, muts)
    return task


def column_of(projection: dict, uuid: str) -> str | None:
    for col in projection["columns"]:
        if any(c["uuid"] == uuid for c in col["cards"]):
            return col["id"]
    return None


def test_lifecycle_classification(svc: BoardService):
    backlog = make(svc, "plain pending")
    ready = make(svc, "ready", ready=True)
    doing = make(svc, "active", ready=True, started=True)
    waiting = make(svc, "waiting", wait=datetime.now(UTC) + timedelta(days=3))
    done = make(svc, "finished", completed=True)
    p = svc.projection("lifecycle")
    assert column_of(p, backlog.uuid) == "backlog"
    assert column_of(p, ready.uuid) == "ready"
    assert column_of(p, doing.uuid) == "doing"  # doing beats ready
    assert column_of(p, waiting.uuid) == "waiting"
    assert column_of(p, done.uuid) == "done"
    assert p["unmapped"] == 0


def test_move_out_of_doing_stops_first(svc: BoardService):
    task = make(svc, "active", started=True)
    moved = svc.move_task(
        "lifecycle", task.uuid, "ready", task.modified.isoformat()
    )
    assert moved.start is None
    assert "ready" in moved.tags


def test_move_out_of_done_reopens(svc: BoardService):
    task = make(svc, "finished", completed=True)
    moved = svc.move_task(
        "lifecycle", task.uuid, "backlog", task.modified.isoformat()
    )
    assert moved.status == "pending"
    assert moved.end is None


def test_waiting_requires_prompt(svc: BoardService):
    task = make(svc, "plain")
    with pytest.raises(PromptRequiredError):
        svc.move_task("lifecycle", task.uuid, "waiting", task.modified.isoformat())
    moved = svc.move_task(
        "lifecycle",
        task.uuid,
        "waiting",
        task.modified.isoformat(),
        prompt_value=(datetime.now(UTC) + timedelta(days=5)).strftime("%Y-%m-%d"),
    )
    assert moved.status == "waiting"


def test_stale_modified_conflicts(svc: BoardService):
    task = make(svc, "plain")
    stale = task.modified.isoformat()
    svc.repo.apply(task.uuid, [cmd.AddTag("elsewhere")])
    with pytest.raises(ConflictError):
        svc.move_task("lifecycle", task.uuid, "ready", stale)


def test_daily_overdue_is_read_only(svc: BoardService):
    task = make(svc, "overdue", due=datetime.now(UTC) - timedelta(days=2))
    with pytest.raises(ReadOnlyColumnError):
        svc.move_task("daily", task.uuid, "overdue", task.modified.isoformat())


def test_daily_clear_due_on_no_date(svc: BoardService):
    task = make(svc, "dated", due=datetime.now(UTC) + timedelta(days=2))
    moved = svc.move_task("daily", task.uuid, "no-date", task.modified.isoformat())
    assert moved.due is None


def test_manual_reorder_persists_rank(svc: BoardService):
    a = make(svc, "first")
    b = make(svc, "second")
    c = make(svc, "third")
    for i, t in enumerate([a, b, c]):
        svc.reorder_task("lifecycle", t.uuid, i, t.modified.isoformat())
    p = svc.projection("lifecycle")
    order = [card["uuid"] for card in p["columns"][0]["cards"]]
    assert order == [a.uuid, b.uuid, c.uuid]
    fresh_c = svc.repo.get(c.uuid)
    svc.reorder_task("lifecycle", c.uuid, 0, fresh_c.modified.isoformat())
    p = svc.projection("lifecycle")
    order = [card["uuid"] for card in p["columns"][0]["cards"]]
    assert order == [c.uuid, a.uuid, b.uuid]
