from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sisyphus.application.board_service import BoardService
from sisyphus.application.task_service import TaskService
from sisyphus.config.loader import load_config
from sisyphus.domain import commands as cmd
from sisyphus.domain import policy
from sisyphus.domain.errors import ValidationError
from sisyphus.domain.task import Task, local_today
from sisyphus.repositories.fake import FakeTaskRepository


@pytest.fixture
def services():
    repo = FakeTaskRepository(seed=False)
    config = load_config(Path(__file__).resolve().parents[2] / "config/boards.yaml")
    return BoardService(config, repo), TaskService(repo)


def act(service, task, action, **kwargs):
    return service.action(task.uuid, task.modified.isoformat(), action, **kwargs)


def test_dependency_policy_is_universe_wide_and_shared(services):
    boards, tasks = services
    prerequisite = boards.create_task("lifecycle", {"description": "External", "project": "other"})
    task = boards.create_task("lifecycle", {"description": "Blocked", "project": "own",
                                          "dependencies": [prerequisite.uuid]})
    detail = tasks.detail(task)
    assert detail["lifecycle"] == "backlog"
    assert detail["open_dependencies"] == [{"uuid": prerequisite.uuid, "description": "External"}]
    assert "start" not in detail["allowed_actions"]
    with pytest.raises(ValidationError):
        act(tasks, task, "start")
    boards.repo.apply(task.uuid, [cmd.AddTag("next")])
    waiting = boards.projection("project:own")["columns"][3]["cards"][0]
    assert waiting["lifecycle"] == "waiting"
    assert waiting["open_dependencies"] == tasks.detail(task)["open_dependencies"]
    act(tasks, prerequisite, "complete")
    assert tasks.detail(task)["lifecycle"] == "ready"


def test_blocker_and_dependency_clear_independently(services):
    boards, tasks = services
    task = boards.create_task("lifecycle", {"description": "Work", "due": "2030-03-05"})
    act(tasks, task, "start")
    assert "next" in task.tags
    act(tasks, task, "block", blocker="Approval", date=local_today().isoformat())
    assert task.start is None and "next" in task.tags and task.wait is None
    assert "follow_up" in tasks.detail(task)["attention_reasons"]
    prerequisite = boards.create_task("lifecycle", {"description": "Prerequisite"})
    tasks.patch(task.uuid, task.modified.isoformat(), {"depends": [prerequisite.uuid]})
    act(tasks, task, "clear_blocker")
    assert task.depends == [prerequisite.uuid]
    assert tasks.detail(task)["lifecycle"] == "waiting"
    assert task.start is None and task.due.hour == 23


def test_rollover_is_pure_and_deferral_uses_timestamp():
    now = datetime(2026, 9, 9, 12, tzinfo=UTC)
    task = Task("a", "Work", "pending", tags=["next"],
                wait=now + timedelta(days=1), udas={policy.PLAN: "2026-09-08"})
    assert policy.describe(task, {"a": task}, now)["deferred"]
    later = policy.describe(task, {"a": task}, now + timedelta(days=2))
    assert not later["deferred"] and later["lifecycle"] == "ready"
    assert later["attention_reasons"] == ["unfinished_plan"]
    assert task.udas[policy.PLAN] == "2026-09-08"
    task.udas[policy.BLOCKER] = "Approval"
    task.udas[policy.FOLLOWUP] = "2026-09-09"
    assert policy.describe(task, {"a": task}, now + timedelta(days=2))["lifecycle"] == "waiting"


def test_today_disjoint_sections_and_deadlines_unchanged(services):
    boards, tasks = services
    work = boards.create_task("daily", {"description": "Work", "due": local_today().isoformat()})
    original_due = work.due
    act(tasks, work, "plan_today")
    assert work.udas[policy.PLAN].split("T")[1].startswith("00:00:00")
    assert work.due == original_due
    act(tasks, work, "start")
    old = boards.create_task("daily", {"description": "Old plan", "planned_for": "2020-01-01"})
    chosen = boards.create_task("daily", {"description": "Chosen", "due": local_today().isoformat()})
    act(tasks, chosen, "plan_today")
    projection = boards.projection("daily")
    assert projection["view"] == "today" and projection["columns"] == []
    assert projection["today"]["doing"][0]["uuid"] == work.uuid
    assert projection["today"]["unfinished_plans"][0]["uuid"] == old.uuid
    assert projection["today"]["chosen"][0]["uuid"] == chosen.uuid
    assert projection["today"]["chosen"][0]["attention_reasons"] == ["due_today"]
    cards = [c["uuid"] for section in projection["today"].values() for c in section]
    assert len(cards) == len(set(cards)) == 3
    act(tasks, old, "clear_plan")
    assert "next" in old.tags
    act(tasks, work, "defer", date="2099-01-01")
    assert work.start is None and policy.PLAN not in work.udas
    assert work.wait.hour == 0 and work.due == original_due
    act(tasks, work, "return_now")
    assert tasks.detail(work)["lifecycle"] == "ready"


def test_history_groups_and_template_edges(services):
    boards, tasks = services
    old = boards.create_task("lifecycle", {"description": "Old", "project": "history"})
    act(tasks, old, "complete")
    old.end = datetime(2000, 1, 1, tzinfo=UTC)
    later = boards.create_task("lifecycle", {"description": "Template", "project": "later"})
    later.status = "recurring"
    deleted = boards.create_task("lifecycle", {"description": "Deleted", "project": "deleted"})
    boards.repo.delete(deleted.uuid)
    index = {b["project"]: b for b in boards.list_boards() if b["kind"] == "project"}
    assert index["history"]["group"] == "history"
    assert index["later"]["group"] == "later"
    assert "deleted" not in index
    assert not boards.projection("project:history")["columns"][4]["cards"]
    assert boards.projection("project:history", history=True)["columns"][4]["cards"][0]["uuid"] == old.uuid
    act(tasks, old, "reopen")
    assert next(b for b in boards.list_boards() if b["project"] == "history")["group"] == "later"


@pytest.mark.parametrize("payload", [
    {"priority": "urgent"}, {"planned_for": "nonsense"}, {"column_id": "unknown"},
    {"column_id": "waiting"}, {"dependencies": ["unknown"]}, {"annotations": [" "]},
    {"follow_up_on": "2030-01-01"}, {"blocker": "Approval", "column_id": "doing"},
])
def test_creation_prevalidates_without_persisting(services, payload):
    boards, _ = services
    from sisyphus.domain.errors import DomainError
    with pytest.raises(DomainError):
        boards.create_task("lifecycle", {"description": "Invalid", **payload})
    assert not boards.universe()


def test_http_action_and_history_contract(monkeypatch):
    monkeypatch.setenv("SISYPHUS_AUTH", "none")
    monkeypatch.setenv("SISYPHUS_REPOSITORY", "fake")
    from sisyphus.main import create_app
    with TestClient(create_app()) as client:
        task = client.post("/api/v1/boards/daily/tasks", json={"description": "API task"}).json()["task"]
        response = client.post(f"/api/v1/tasks/{task['uuid']}/action", json={
            "action": "plan_today", "expected_modified": task["modified"],
        })
        assert response.status_code == 200
        planned = response.json()["task"]
        assert planned["committed"] and planned["planned_for"] == local_today().isoformat()
        assert client.post(f"/api/v1/tasks/{task['uuid']}/start", json={
            "expected_modified": task["modified"],
        }).status_code == 409
        history = client.get("/api/v1/boards/daily?history=true").json()
        assert history["view"] == "kanban" and len(history["columns"]) == 5


def test_http_today_drop_targets_validate_current_task(monkeypatch):
    monkeypatch.setenv("SISYPHUS_AUTH", "none")
    monkeypatch.setenv("SISYPHUS_REPOSITORY", "fake")
    from sisyphus.main import create_app
    with TestClient(create_app()) as client:
        task = client.post("/api/v1/boards/daily/tasks", json={
            "description": "Drop target API", "column_id": "doing", "due": "2030-03-05",
        }).json()["task"]
        url = f"/api/v1/tasks/{task['uuid']}/action"
        response = client.post(url, json={"action": "up_next", "expected_modified": task["modified"]})
        assert response.status_code == 200
        chosen = response.json()["task"]
        assert chosen["lifecycle"] == "ready" and chosen["start"] is None
        assert chosen["planned_for"] == local_today().isoformat()
        assert client.post(url, json={
            "action": "ready_pool", "expected_modified": task["modified"],
        }).status_code == 409
        response = client.post(url, json={
            "action": "ready_pool", "expected_modified": chosen["modified"],
        })
        ready = response.json()["task"]
        assert response.status_code == 200 and ready["planned_for"] is None
        assert ready["committed"] and ready["due"] == task["due"]


def test_native_date_uda_timezone_roundtrip(monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Athens")
    assert policy.date_value("20260908T210000Z").isoformat() == "2026-09-09"
    assert policy.midnight("2026-09-09").hour == 0


def test_legacy_config_normalizes_without_date_columns(tmp_path):
    import yaml
    source = Path(__file__).resolve().parents[2] / "config/boards.yaml"
    data = yaml.safe_load(source.read_text())
    data["boards"][0]["ready_tag"] = "legacy"
    data["boards"][1]["columns"] = [{"old": "unsupported old deadline rule"}]
    path = tmp_path / "boards.yaml"
    path.write_text(yaml.safe_dump(data))
    config = load_config(path)
    assert config.ready_tag == "next"
    assert config.board("daily").columns == []


def test_cli_stop_is_idempotent(monkeypatch, tmp_path):
    from sisyphus.repositories.taskwarrior_cli import TaskwarriorCliRepository
    monkeypatch.setenv("SISYPHUS_TASKRC", str(tmp_path / "taskrc"))
    monkeypatch.setenv("SISYPHUS_TASKDATA", str(tmp_path / "data"))
    repo = TaskwarriorCliRepository()
    task = Task("uuid", "Already stopped", "pending")
    monkeypatch.setattr(repo, "get", lambda uuid: task)
    calls = []
    monkeypatch.setattr(repo, "_run", lambda args: calls.append(args))
    repo._apply_one(task.uuid, cmd.Stop())
    assert calls == []
    task.start = datetime.now(UTC)
    repo._apply_one(task.uuid, cmd.Stop())
    assert calls == [["uuid", "stop"]]


def test_empty_expected_modified_cannot_bypass_checks(services):
    boards, tasks = services
    task = boards.create_task("lifecycle", {"description": "Unchanged"})
    with pytest.raises(ValidationError, match="expected_modified"):
        tasks.action(task.uuid, "", "start")
    with pytest.raises(ValidationError, match="expected_modified"):
        boards.move_task("lifecycle", task.uuid, "ready", "")
    assert task.start is None and task.tags == []


def test_conflicting_plan_and_backlog_rejected_before_creation(services):
    boards, _ = services
    with pytest.raises(ValidationError, match="planned task"):
        boards.create_task("daily", {"description": "Conflicting intent",
                           "planned_for": local_today().isoformat(), "column_id": "backlog"})
    assert not boards.universe()


def test_today_drop_targets_preserve_deadline_and_commitment(services):
    boards, tasks = services
    task = boards.create_task("lifecycle", {"description": "Drag through Today",
                                           "column_id": "ready", "due": "2030-03-05"})
    deadline = task.due
    act(tasks, task, "up_next")
    assert tasks.detail(task)["planned_for"] == local_today().isoformat()
    assert task.start is None
    act(tasks, task, "start")
    act(tasks, task, "up_next")
    assert task.start is None and tasks.detail(task)["lifecycle"] == "ready"
    assert tasks.detail(task)["planned_for"] == local_today().isoformat()
    act(tasks, task, "start")
    act(tasks, task, "ready_pool")
    assert task.start is None and task.tags == ["next"]
    assert tasks.detail(task)["planned_for"] is None and task.due == deadline
    act(tasks, task, "block", blocker="Approval")
    for target in ("up_next", "ready_pool"):
        with pytest.raises(ValidationError):
            act(tasks, task, target)
    act(tasks, task, "clear_blocker")
    act(tasks, task, "defer", date="2099-01-01")
    for target in ("up_next", "ready_pool"):
        with pytest.raises(ValidationError):
            act(tasks, task, target)
    assert tasks.detail(task)["deferred"] and task.due == deadline


def test_resolving_external_started_blocker_preserves_commitment(services):
    boards, tasks = services
    task = boards.create_task("lifecycle", {"description": "Started by native client"})
    boards.repo.apply(task.uuid, [cmd.Start(), cmd.SetUda(policy.BLOCKER, "Approval")])
    assert task.tags == [] and tasks.detail(task)["lifecycle"] == "waiting"
    act(tasks, task, "clear_blocker")
    assert tasks.detail(task)["lifecycle"] == "ready"
    assert task.tags == ["next"] and task.start is None


@pytest.mark.parametrize("field,value", [("description", 42), ("project", ["wrong"]),
                                       ("priority", {}), ("due", 42)])
def test_malformed_patch_returns_validation_without_partial_write(services, field, value):
    boards, tasks = services
    task = boards.create_task("lifecycle", {"description": "Original"})
    with pytest.raises(ValidationError):
        tasks.patch(task.uuid, task.modified.isoformat(), {"description": "Changed", field: value})
    assert task.description == "Original"


def test_waiting_intent_commits_but_factual_block_does_not(services):
    boards, tasks = services
    factual = boards.create_task("lifecycle", {"description": "Potential work"})
    act(tasks, factual, "block", blocker="Approval")
    assert tasks.detail(factual)["lifecycle"] == "backlog"
    act(tasks, factual, "clear_blocker")
    assert not tasks.detail(factual)["committed"]
    boards.move_task("lifecycle", factual.uuid, "waiting", factual.modified.isoformat(),
                     prompt_value="Approval")
    assert tasks.detail(factual)["lifecycle"] == "waiting"
    act(tasks, factual, "clear_blocker")
    assert tasks.detail(factual)["lifecycle"] == "ready"
    created = boards.create_task("lifecycle", {"description": "Committed blocked work",
                                "column_id": "waiting", "prompt_value": "Approval"})
    assert tasks.detail(created)["lifecycle"] == "waiting"
    assert created.wait is None and created.tags == ["next"]


@pytest.mark.parametrize("days,reason", [(0, "due_today"), (-1, "overdue")])
def test_deferred_deadlines_remain_attention_without_promotion(services, days, reason):
    boards, tasks = services
    task = boards.create_task("lifecycle", {"description": "Postponed",
        "due": (local_today() + timedelta(days=days)).isoformat()})
    act(tasks, task, "defer", date="2099-01-01")
    projection = boards.projection("daily")
    card = projection["today"]["attention"][0]
    assert card["uuid"] == projection["deferred"][0]["uuid"] == task.uuid
    assert card["deferred"] and not card["committed"]
    assert card["attention_reasons"] == [reason]
    assert "start" not in card["allowed_actions"]
    assert "plan_today" not in card["allowed_actions"]
    assert not any(projection["today"][key] for key in ("doing", "chosen", "ready_pool"))


def test_tagged_recurring_template_stays_later(services):
    boards, _ = services
    task = boards.create_task("lifecycle", {"description": "Template", "project": "repeat"})
    task.status = "recurring"
    task.tags = ["next"]
    summary = next(b for b in boards.list_boards() if b["project"] == "repeat")
    assert summary["group"] == "later" and summary["committed_count"] == 0
    assert summary["unfinished_count"] == 1


def test_bad_external_dates_do_not_break_projections(services):
    boards, tasks = services
    task = boards.create_task("lifecycle", {"description": "External", "project": "external"})
    task.udas.update({policy.PLAN: "bad-date", policy.FOLLOWUP: "2026-99-99"})
    detail = tasks.detail(task)
    assert detail["planned_for"] is None and detail["follow_up_on"] is None
    assert boards.list_boards() and boards.projection("daily")
    assert boards.projection("lifecycle")["columns"][0]["cards"]


def test_http_today_creation_and_empty_block_date(monkeypatch):
    monkeypatch.setenv("SISYPHUS_AUTH", "none")
    monkeypatch.setenv("SISYPHUS_REPOSITORY", "fake")
    from sisyphus.main import create_app
    with TestClient(create_app()) as client:
        for column in (None, "backlog"):
            response = client.post("/api/v1/boards/daily/tasks", json={
                "description": "Capture", "column_id": column})
            assert response.status_code == 201
            assert response.json()["task"]["lifecycle"] == "backlog"
        response = client.post("/api/v1/boards/daily/tasks", json={
            "description": "Today", "column_id": "ready",
            "planned_for": local_today().isoformat(), "due": "2030-03-05"})
        assert response.status_code == 201
        task = response.json()["task"]
        assert task["lifecycle"] == "ready" and task["planned_for"] == local_today().isoformat()
        assert task["due"].startswith("2030-03-05T23:59:59")
        response = client.post(f"/api/v1/tasks/{task['uuid']}/action", json={
            "action": "block", "expected_modified": task["modified"],
            "blocker": "Approval", "date": ""})
        assert response.status_code == 422
        assert client.get(f"/api/v1/tasks/{task['uuid']}").json()["task"]["blocker"] is None
