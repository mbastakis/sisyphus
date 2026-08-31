import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from pathlib import Path

import pytest

TASKBOARD_DIR = Path(__file__).parents[1]


def request_json(base_url: str, path: str, method: str = "GET", payload: dict | None = None):
    body = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=body,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def board_tasks(board: dict) -> dict[str, dict]:
    return {task["uuid"]: task for column in board["columns"] for task in column["tasks"]}


def taskwarrior_binary() -> str | None:
    candidates = [
        os.environ.get("TASKBOARD_TASK_BIN"),
        "/opt/homebrew/bin/task",
        "/usr/local/bin/task",
        "/usr/bin/task",
    ]
    for candidate in filter(None, candidates):
        if not Path(candidate).is_file():
            continue
        result = subprocess.run(
            [candidate, "--version"], capture_output=True, text=True, check=False
        )
        if result.returncode == 0 and result.stdout.strip()[:1].isdigit():
            return candidate
    return None


def isolated_task_env(taskrc: Path, data_dir: Path) -> dict[str, str]:
    return {
        **os.environ,
        "TASKRC": str(taskrc),
        "TASKDATA": str(data_dir),
    }


def assert_isolated_taskwarrior(task_bin: str, env: dict[str, str], data_dir: Path) -> None:
    result = subprocess.run(
        [task_bin, "diagnostics"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    diagnostics = f"{result.stdout}\n{result.stderr}"
    expected = str(data_dir.resolve())
    if result.returncode != 0 or f"Data: {expected}" not in diagnostics:
        pytest.fail(
            "refusing to run mutation tests without an isolated Taskwarrior database:\n"
            f"expected data directory: {expected}\n{diagnostics}"
        )


def delete_isolated_tasks(task_bin: str, env: dict[str, str]) -> None:
    result = subprocess.run(
        [task_bin, "rc.json.array=on", "status:pending", "export"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    uuids = [task["uuid"] for task in json.loads(result.stdout) if task.get("uuid")]
    if not uuids:
        return
    result = subprocess.run(
        [task_bin, "rc.verbose=nothing", *uuids, "delete"],
        env=env,
        input="all\n",
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout


@pytest.fixture
def taskboard_server(tmp_path: Path) -> Iterator[str]:
    task_bin = taskwarrior_binary()
    if task_bin is None:
        pytest.skip("Taskwarrior is not installed")

    data_dir = tmp_path / "taskwarrior"
    data_dir.mkdir()
    taskrc = tmp_path / "taskrc"
    taskrc.write_text(
        "\n".join(
            [
                f"data.location={data_dir}",
                "confirmation=off",
                "recurrence.confirmation=off",
                "verbose=off",
                "",
            ]
        )
    )
    with socket.socket() as listener:
        try:
            listener.bind(("127.0.0.1", 0))
        except PermissionError:
            pytest.skip("loopback sockets are unavailable in this validation sandbox")
        port = listener.getsockname()[1]

    env = {
        **isolated_task_env(taskrc, data_dir),
        "TASKBOARD_ALLOW_NO_AUTH": "1",
        "TASKBOARD_DONE_DAYS": "3650",
        "TASKBOARD_HOST": "127.0.0.1",
        "TASKBOARD_PORT": str(port),
        "TASKBOARD_SYNC_ENABLED": "0",
        "TASKBOARD_TASK_BIN": task_bin,
    }
    assert_isolated_taskwarrior(task_bin, env, data_dir)
    process = subprocess.Popen(
        [sys.executable, "taskboard.py"],
        cwd=TASKBOARD_DIR,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    base_url = f"http://127.0.0.1:{port}"
    try:
        for _ in range(50):
            try:
                with urllib.request.urlopen(f"{base_url}/healthz", timeout=0.2) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            output = process.communicate(timeout=2)[0]
            pytest.fail(f"taskboard server did not start:\n{output}")
        yield base_url
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        delete_isolated_tasks(task_bin, env)


def test_real_taskwarrior_mutation_lifecycle(taskboard_server: str) -> None:
    opener = urllib.request.build_opener(NoRedirectHandler)
    with pytest.raises(urllib.error.HTTPError) as redirect:
        opener.open(f"{taskboard_server}/authentik-callback-error", timeout=5)
    assert redirect.value.code == 303
    assert redirect.value.headers["Location"] == "/"

    status, board = request_json(
        taskboard_server,
        "/api/tasks",
        "POST",
        {"description": "Integration parent", "project": "sisyphus.test", "column": "backlog"},
    )
    assert status == 200, board
    parent = next(
        task for task in board_tasks(board).values() if task["description"] == "Integration parent"
    )

    time.sleep(1.1)
    status, board = request_json(
        taskboard_server,
        f"/api/tasks/{parent['uuid']}",
        "PATCH",
        {
            "description": "Integration parent updated",
            "priority": "M",
            "expected_modified": parent["modified"],
        },
    )
    assert status == 200, board
    updated_parent = board_tasks(board)[parent["uuid"]]
    assert updated_parent["description"] == "Integration parent updated"
    assert updated_parent["priority"] == "M"

    status, conflict = request_json(
        taskboard_server,
        f"/api/tasks/{parent['uuid']}",
        "PATCH",
        {"description": "Stale overwrite", "expected_modified": parent["modified"]},
    )
    assert status == 409
    assert conflict["current_task"]["description"] == "Integration parent updated"

    status, created = request_json(
        taskboard_server,
        f"/api/tasks/{parent['uuid']}/dependencies",
        "POST",
        {
            "description": "Integration blocker",
            "expected_modified": updated_parent["modified"],
        },
    )
    assert status == 200, created
    blocker_uuid = created["created_uuid"]
    tasks = board_tasks(created["board"])
    assert blocker_uuid in tasks[parent["uuid"]]["depends"]
    assert tasks[blocker_uuid]["project"] == "sisyphus.test"

    status, board = request_json(
        taskboard_server,
        "/api/tasks/bulk",
        "POST",
        {
            "tasks": [
                {"uuid": uuid, "expected_modified": tasks[uuid]["modified"]}
                for uuid in (parent["uuid"], blocker_uuid)
            ],
            "changes": {"priority": "H", "tags": "integration"},
        },
    )
    assert status == 200
    tasks = board_tasks(board)
    for uuid in (parent["uuid"], blocker_uuid):
        assert tasks[uuid]["priority"] == "H"
        assert "integration" in tasks[uuid]["tags"]

    status, board = request_json(
        taskboard_server,
        f"/api/tasks/{blocker_uuid}/move",
        "POST",
        {"column": "ready", "expected_modified": tasks[blocker_uuid]["modified"]},
    )
    assert status == 200
    tasks = board_tasks(board)
    assert "next" in tasks[blocker_uuid]["tags"]

    status, board = request_json(
        taskboard_server,
        f"/api/tasks/{blocker_uuid}",
        "DELETE",
        {"expected_modified": tasks[blocker_uuid]["modified"]},
    )
    assert status == 200
    assert blocker_uuid not in board_tasks(board)
