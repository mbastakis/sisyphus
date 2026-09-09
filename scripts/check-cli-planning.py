"""Integration smoke of current services against an isolated native replica.

Mount only application source/config into a pinned image, not personal data:
  docker run --rm -i --entrypoint python \
    -v "$PWD/backend/src:/check/src:ro" -v "$PWD/config:/check/config:ro" \
    -e PYTHONPATH=/check/src sisyphus:latest - < scripts/check-cli-planning.py
"""

import os
import tempfile
from pathlib import Path


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sisyphus-cli-") as directory:
        root = Path(directory)
        taskrc = root / "taskrc"
        taskrc.write_text(
            "confirmation=no\nverbose=nothing\nhooks=off\n"
            "uda.sisyphus_plan.type=date\n"
            "uda.sisyphus_blocker.type=string\n"
            "uda.sisyphus_followup.type=date\n"
        )
        os.environ.update(
            SISYPHUS_TASKRC=str(taskrc), SISYPHUS_TASKDATA=str(root / "data"),
            TZ="Europe/Athens",
        )
        from sisyphus.application.board_service import BoardService
        from sisyphus.application.task_service import TaskService
        from sisyphus.config.loader import load_config
        from sisyphus.domain.errors import ValidationError
        from sisyphus.domain.task import local_today
        from sisyphus.repositories.taskwarrior_cli import TaskwarriorCliRepository

        repo = TaskwarriorCliRepository()
        boards = BoardService(load_config(Path("/check/config/boards.yaml")), repo)
        tasks = TaskService(repo)

        def action(uuid, name, **fields):
            current = repo.get(uuid)
            return tasks.action(uuid, current.modified.isoformat(), name, **fields)

        first = boards.create_task("daily", {
            "description": "Review statement", "project": "finance",
            "column_id": "ready", "planned_for": local_today().isoformat(),
            "due": local_today().isoformat(),
        })
        deadline = first.due
        assert tasks.detail(first)["lifecycle"] == "ready"
        assert boards.projection("daily")["today"]["chosen"][0]["uuid"] == first.uuid
        action(first.uuid, "start")
        action(first.uuid, "up_next")
        assert repo.get(first.uuid).start is None
        assert tasks.detail(repo.get(first.uuid))["planned_for"] == local_today().isoformat()
        action(first.uuid, "ready_pool")
        assert tasks.detail(repo.get(first.uuid))["planned_for"] is None
        assert repo.get(first.uuid).due == deadline
        action(first.uuid, "start")
        action(first.uuid, "block", blocker="Accountant statement", date=local_today().isoformat())
        blocked = tasks.detail(repo.get(first.uuid))
        assert blocked["lifecycle"] == "waiting" and blocked["wait"] is None

        prerequisite = boards.create_task("lifecycle", {
            "description": "Send statement", "project": "other-project",
        })
        current = repo.get(first.uuid)
        tasks.patch(first.uuid, current.modified.isoformat(), {"depends": [prerequisite.uuid]})
        action(first.uuid, "clear_blocker")
        assert tasks.detail(repo.get(first.uuid))["lifecycle"] == "waiting"
        project_card = boards.projection("project:finance")["columns"][3]["cards"][0]
        assert project_card["open_dependencies"][0]["uuid"] == prerequisite.uuid
        try:
            action(first.uuid, "start")
        except ValidationError:
            pass
        else:
            raise AssertionError("Blocked work must not start")

        action(first.uuid, "defer", date="2099-01-01")
        today = boards.projection("daily")
        assert today["deferred"][0]["uuid"] == first.uuid
        assert today["today"]["attention"][0]["uuid"] == first.uuid
        action(prerequisite.uuid, "complete")
        action(first.uuid, "return_now")
        returned = tasks.detail(repo.get(first.uuid))
        assert returned["lifecycle"] == "ready" and returned["planned_for"] is None
        assert repo.get(first.uuid).due == deadline

        action(first.uuid, "complete")
        summary = next(b for b in boards.list_boards() if b["project"] == "finance")
        assert summary["group"] == "history"
        assert boards.projection("project:finance", history=True)["columns"][4]["cards"]
        action(first.uuid, "reopen")
        assert tasks.detail(repo.get(first.uuid))["lifecycle"] == "ready"
        print("Current CLI services: Today, blockers, cross-project prerequisites, deferral, history PASS")


if __name__ == "__main__":
    main()
