from __future__ import annotations

import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Request

from .. import __version__
from ..domain.task import server_timezone

router = APIRouter(prefix="/api/v1", tags=["system"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/system")
def system(request: Request):
    repo = request.app.state.repo
    last_sync = getattr(repo, "last_sync", None)
    return {
        "version": __version__,
        "repository": os.environ.get("SISYPHUS_REPOSITORY", "fake"),
        "config_version": request.app.state.config.version,
        "server_timezone": str(server_timezone()),
        "utc_offset_minutes": int(
            (datetime.now(server_timezone()).utcoffset() or timedelta()).total_seconds() // 60
        ),
        "sync": {
            "status": "synced" if last_sync else "unknown",
            "last_success": last_sync.isoformat() if last_sync else None,
        },
    }


@router.post("/sync")
def sync(request: Request):
    result = request.app.state.repo.sync()
    return {
        "ok": result.ok,
        "detail": result.detail,
        "at": result.at.isoformat() if result.at else None,
    }
