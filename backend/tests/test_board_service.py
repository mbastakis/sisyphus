from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from sisyphus.application.board_service import BoardService
from sisyphus.application.task_service import TaskService
from sisyphus.config.loader import load_config
from sisyphus.domain import commands as cmd
from sisyphus.domain.errors import (
    ConflictError,
    NotFoundError,
    PromptRequiredError,
    ReadOnlyColumnError,
    ValidationError,
)
from sisyphus.repositories.fake import FakeTaskRepository

CONFIG = Path(__file__).resolve().parents[2] / "config" / "boards.yaml"


@pytest.fixture()
def svc() -> BoardService:
    return BoardService(load_config(CONFIG), FakeTaskRepository(seed=False))


READY = "next"


def make(svc: BoardService, description: str, **kwargs):
    task = svc.repo.create(cmd.CreateTask(description=description, project=kwargs.get("project")))
    muts = []
    for field in ("due", "wait"):
        if field in kwargs:
            muts.append(cmd.SetField(field, kwargs[field]))
    if kwargs.get("ready"):
        muts.append(cmd.AddTag(READY))
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
    assert READY in moved.tags


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


def test_ready_tag_matches_cli_convention(svc: BoardService):
    assert svc.config.board("lifecycle").ready_tag == "next"
    task = make(svc, "prioritised on the CLI")
    svc.repo.apply(task.uuid, [cmd.AddTag("next")])
    assert column_of(svc.projection("lifecycle"), task.uuid) == "ready"


def test_create_ignores_tags_and_column_sets_marker(svc: BoardService):
    task = svc.create_task(
        "lifecycle", {"description": "new", "tags": ["rogue"], "column_id": "ready"}
    )
    assert task.tags == [READY]
    back = svc.move_task("lifecycle", task.uuid, "backlog", task.modified.isoformat())
    assert back.tags == []


def test_tags_are_not_patchable(svc: BoardService):
    task = make(svc, "plain")
    with pytest.raises(ValidationError):
        TaskService(svc.repo).patch(task.uuid, task.modified.isoformat(), {"tags": ["x"]})


def test_project_boards_appear_and_disappear(svc: BoardService):
    assert [b["id"] for b in svc.list_boards()] == ["lifecycle", "daily"]
    task = make(svc, "child", project="work.sisyphus")
    boards = {b["id"]: b for b in svc.list_boards()}
    assert "project:work" not in boards
    assert boards["project:work.sisyphus"]["kind"] == "project"
    assert boards["project:work.sisyphus"]["open_count"] == 1
    p = svc.projection("project:work.sisyphus")
    assert p["board"]["project"] == "work.sisyphus"
    assert p["board"]["kind"] == "project"
    assert column_of(p, task.uuid) == "backlog"
    with pytest.raises(NotFoundError):
        svc.projection("project:work")
    # Completing keeps the exact project board (recent Done) but drops its open count.
    svc.repo.apply(task.uuid, [cmd.Complete()])
    boards = {b["id"]: b for b in svc.list_boards()}
    assert boards["project:work.sisyphus"]["open_count"] == 0
    svc.repo.delete(task.uuid)
    assert "project:work.sisyphus" not in {b["id"] for b in svc.list_boards()}
    with pytest.raises(NotFoundError):
        svc.projection("project:work.sisyphus")


def test_project_board_does_not_include_descendant_projects(svc: BoardService):
    parent = make(svc, "parent", project="work")
    child = make(svc, "child", project="work.sisyphus")
    projection = svc.projection("project:work")
    assert column_of(projection, parent.uuid) == "backlog"
    assert all(
        card["uuid"] != child.uuid
        for column in projection["columns"]
        for card in column["cards"]
    )


def test_project_board_create_defaults_project_and_moves(svc: BoardService):
    make(svc, "seed", project="home")
    task = svc.create_task("project:home", {"description": "new on project board"})
    assert task.project == "home"
    moved = svc.move_task("project:home", task.uuid, "ready", task.modified.isoformat())
    assert READY in moved.tags
    svc.reorder_task("project:home", moved.uuid, 0, moved.modified.isoformat())
    assert svc.repo.get(task.uuid).udas.get("sisyphus_rank_project") is not None


def test_config_rejects_additional_static_boards(tmp_path):
    bad = tmp_path / "boards.yaml"
    bad.write_text(CONFIG.read_text() + "\n  - id: home\n    name: Home\n    template: lifecycle\n")
    with pytest.raises(ValueError, match="exactly"):
        load_config(bad)
