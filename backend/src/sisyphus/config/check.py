"""Board configuration validation command.

Usage:
    python -m sisyphus.config.check [--taskrc-udas] [path/to/boards.yaml]

Parses and validates the YAML against the full Pydantic schema (IDs, rank
UDA uniqueness, write-rule shape, template expansion) and prints a summary.
With --taskrc-udas it instead prints the taskrc `uda.*` declaration lines
required for every configured rank UDA (used by the container entrypoint).
Exit code 0 on success, 1 on failure. No Taskwarrior process is invoked and
nothing is mutated.
"""

from __future__ import annotations

import sys
from pathlib import Path

from .loader import find_config_path, load_config
from .models import PROJECT_RANK_UDA


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    udas_only = "--taskrc-udas" in argv
    argv = [a for a in argv if a != "--taskrc-udas"]
    try:
        path = Path(argv[0]) if argv else find_config_path()
        config = load_config(path)
    except Exception as exc:  # noqa: BLE001 - CLI boundary, report anything
        print(f"INVALID: {exc}", file=sys.stderr)
        return 1

    if udas_only:
        for board in config.boards:
            if board.ordering.rank_uda:
                print(f"uda.{board.ordering.rank_uda}.type=string")
                print(f"uda.{board.ordering.rank_uda}.label=Sisyphus rank ({board.id})")
        print(f"uda.{PROJECT_RANK_UDA}.type=string")
        print(f"uda.{PROJECT_RANK_UDA}.label=Sisyphus rank (project boards)")
        for name, kind, label in (
            ("sisyphus_plan", "date", "Planned day"),
            ("sisyphus_blocker", "string", "Blocked by"),
            ("sisyphus_followup", "date", "Follow up"),
        ):
            print(f"uda.{name}.type={kind}")
            print(f"uda.{name}.label={label}")
        return 0

    print(f"OK: {path} (version {config.version}, {len(config.boards)} boards)")
    for board in config.boards:
        cols = ", ".join(c.id + ("*" if c.write is None else "") for c in board.columns)
        rank = f" rank_uda={board.ordering.rank_uda}" if board.ordering.rank_uda else ""
        print(f"  - {board.id}: [{cols}] ordering={board.ordering.mode}{rank}")
        if board.ordering.rank_uda:
            print(
                f"    taskrc needs: uda.{board.ordering.rank_uda}.type=string "
                f"uda.{board.ordering.rank_uda}.label='Sisyphus rank ({board.id})'"
            )
    print(
        f"  - project:<name>: dynamic lifecycle board per project, "
        f"ordering=manual rank_uda={PROJECT_RANK_UDA}"
    )
    print(f"    taskrc needs: uda.{PROJECT_RANK_UDA}.type=string")
    print("  (* = read-only column)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
