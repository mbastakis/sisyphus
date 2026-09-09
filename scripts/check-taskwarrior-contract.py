"""Check native planning primitives in an isolated, disposable Taskwarrior replica.

Run against the pinned image (no host replica mounted):
  docker run --rm -i --entrypoint python sisyphus:latest - < scripts/check-taskwarrior-contract.py
"""

import json
import os
import subprocess
import tempfile
from pathlib import Path


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="sisyphus-contract-") as directory:
        root = Path(directory)
        taskrc = root / "taskrc"
        taskrc.write_text(
            "confirmation=no\nverbose=nothing\nhooks=off\n"
            "uda.sisyphus_plan.type=date\n"
            "uda.sisyphus_blocker.type=string\n"
            "uda.sisyphus_followup.type=date\n"
        )
        env = dict(os.environ, TASKRC=str(taskrc), TASKDATA=str(root / "data"), TZ="Europe/Athens")

        def task(*args: str) -> str:
            return subprocess.run(
                ["task", *args], env=env, text=True, capture_output=True, check=True
            ).stdout

        def read(uuid: str) -> dict:
            return json.loads(task(uuid, "export"))[0]

        task("add", "project:prerequisite", "--", "Send statement")
        prerequisite = json.loads(task("export"))[0]["uuid"]
        task(
            "add", "project:dependent", "+next", f"depends:{prerequisite}",
            "due:20990102T215959Z", "sisyphus_plan:20990101T220000Z",
            "sisyphus_blocker:Accountant statement", "sisyphus_followup:20990103T220000Z",
            "--", "Review statement",
        )
        created = next(t for t in json.loads(task("export")) if t["project"] == "dependent")
        uuid = created["uuid"]
        assert created["sisyphus_plan"] == "20990101T220000Z"
        assert created["sisyphus_followup"] == "20990103T220000Z"
        assert created["sisyphus_blocker"] == "Accountant statement"
        assert prerequisite in created["depends"]

        # Clearing an external condition must not remove the real prerequisite.
        task(uuid, "modify", "sisyphus_blocker:", "sisyphus_followup:")
        cleared = read(uuid)
        assert prerequisite in cleared["depends"]
        assert "sisyphus_blocker" not in cleared
        assert "sisyphus_followup" not in cleared
        task(prerequisite, "done")

        task(uuid, "start")
        assert "start" in read(uuid)
        task(uuid, "stop")
        task(uuid, "modify", "wait:20990101T220000Z", "sisyphus_plan:")
        deferred = read(uuid)
        # Taskwarrior can export pending plus a future wait: status alone is
        # insufficient to decide whether work is deferred.
        assert deferred["wait"] == "20990101T220000Z"
        assert "next" in deferred["tags"]
        assert "start" not in deferred and "sisyphus_plan" not in deferred
        assert deferred["due"] == created["due"]

        task(uuid, "modify", "wait:")
        returned = read(uuid)
        assert "wait" not in returned and "next" in returned["tags"]
        assert "start" not in returned
        assert returned["due"] == created["due"]
        task(uuid, "done")
        assert read(uuid)["status"] == "completed"

        # A planned local day must not use a fixed UTC offset across DST.
        task("add", "sisyphus_plan:2026-03-29T00:00:00", "--", "DST starts")
        task("add", "sisyphus_plan:2026-03-30T00:00:00", "--", "After DST")
        local_days = {
            t["description"]: t["sisyphus_plan"]
            for t in json.loads(task("export"))
            if t["description"] in {"DST starts", "After DST"}
        }
        assert local_days == {
            "DST starts": "20260328T220000Z",
            "After DST": "20260329T210000Z",
        }
        print(f"Taskwarrior {task('--version').strip()}: isolated planning contract passed")


if __name__ == "__main__":
    main()
