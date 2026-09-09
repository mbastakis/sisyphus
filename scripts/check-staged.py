"""Check staged Python contents without rewriting the index or working files."""

import subprocess
import sys


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args])


subprocess.run(["git", "diff", "--cached", "--check"], check=True)
paths = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").split(b"\0")
failed = False
for raw_path in paths:
    if not raw_path.endswith(b".py"):
        continue
    path = raw_path.decode()
    contents = git("show", f":{path}")
    for command in (["check"], ["format", "--check"]):
        result = subprocess.run(
            [
                "uv",
                "tool",
                "run",
                "ruff==0.15.0",
                *command,
                "--config",
                "backend/pyproject.toml",
                "--stdin-filename",
                path,
                "-",
            ],
            input=contents,
        )
        failed |= result.returncode != 0
sys.exit(1 if failed else 0)
