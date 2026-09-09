from __future__ import annotations

import os
from pathlib import Path

import yaml

from .models import AppConfig

DEFAULT_LOCATIONS = [
    Path(os.environ.get("SISYPHUS_CONFIG", "")),
    Path("config/boards.yaml"),
    Path("../config/boards.yaml"),
]


def find_config_path() -> Path:
    for candidate in DEFAULT_LOCATIONS:
        if candidate and str(candidate) != "." and candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "No board configuration found. Set SISYPHUS_CONFIG or create config/boards.yaml"
    )


def load_config(path: Path | None = None) -> AppConfig:
    path = path or find_config_path()
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"{path} does not contain a YAML mapping")
    # Discard legacy deadline write rules before validating their nested schema.
    # This is configuration normalization only, never task-data migration.
    for board in data.get("boards", []):
        if isinstance(board, dict) and board.get("id") == "daily":
            board["columns"] = []
    return AppConfig.model_validate(data)
