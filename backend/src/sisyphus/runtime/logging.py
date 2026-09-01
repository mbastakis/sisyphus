"""Structured logging setup.

SISYPHUS_LOG_FORMAT=json emits one JSON object per line (the container
default via entrypoint); anything else keeps a human-readable line format
for development. SISYPHUS_LOG_LEVEL controls verbosity (default INFO).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "ts": datetime.now(UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            entry["request_id"] = request_id
        for key in ("method", "path", "status", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                entry[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def setup_logging() -> None:
    level = os.environ.get("SISYPHUS_LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler()
    if os.environ.get("SISYPHUS_LOG_FORMAT", "plain").lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-7s %(name)s %(message)s")
        )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
