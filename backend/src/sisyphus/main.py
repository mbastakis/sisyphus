from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .api import boards, events, system, tasks
from .application.board_service import BoardService, _card
from .application.task_service import TaskService
from .config.loader import load_config
from .domain.errors import (
    BackendError,
    ConflictError,
    DomainError,
    NotFoundError,
    PromptRequiredError,
    ReadOnlyColumnError,
    ValidationError,
)
from .runtime.http import install_http_middleware
from .runtime.logging import setup_logging
from .runtime.sync import NotifyingTaskRepository, SyncCoordinator

log = logging.getLogger("sisyphus")


def create_app() -> FastAPI:
    setup_logging()
    config = load_config()
    repo_kind = os.environ.get("SISYPHUS_REPOSITORY", "fake")
    if repo_kind == "cli":
        if not os.environ.get("TZ"):
            raise RuntimeError(
                "TZ must be set explicitly when SISYPHUS_REPOSITORY=cli: date-relative "
                "filters (due:today) are evaluated in the server timezone and a guessed "
                "timezone silently misclassifies the Daily board."
            )
        from .repositories.taskwarrior_cli import TaskwarriorCliRepository

        repo = TaskwarriorCliRepository()
    else:
        from .repositories.fake import FakeTaskRepository

        repo = FakeTaskRepository()
        log.warning("Using FAKE in-memory task repository (development mode)")

    repo = NotifyingTaskRepository(repo)
    sync_interval = float(os.environ.get("SISYPHUS_SYNC_INTERVAL_SECONDS", "30"))
    coordinator = SyncCoordinator(repo, interval_seconds=sync_interval)
    repo.attach(coordinator)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await coordinator.start()
        try:
            yield
        finally:
            await coordinator.stop()

    app = FastAPI(title="Sisyphus", version="0.1.0", lifespan=lifespan)
    app.state.config = config
    app.state.repo = repo
    app.state.sync_coordinator = coordinator
    app.state.board_service = BoardService(config, repo)
    app.state.task_service = TaskService(repo)

    install_http_middleware(app)

    app.include_router(system.router)
    app.include_router(events.router)
    app.include_router(boards.router)
    app.include_router(tasks.router)

    @app.exception_handler(DomainError)
    async def domain_error_handler(request: Request, exc: DomainError):
        status = 400
        body: dict = {"code": exc.code, "message": exc.message}
        if isinstance(exc, NotFoundError):
            status = 404
        elif isinstance(exc, ConflictError):
            status = 409
            if exc.task is not None:
                body["task"] = _card(exc.task, _any_board(config), app.state.task_service.universe())
        elif isinstance(exc, PromptRequiredError):
            status = 422
            body["prompt"] = {"field": exc.field, "input": exc.input_kind}
        elif isinstance(exc, (ValidationError, ReadOnlyColumnError)):
            status = 422
        elif isinstance(exc, BackendError):
            status = 502
        return JSONResponse(status_code=status, content=body)

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception):
        # Sanitized: details go to server logs, the browser gets a stable envelope.
        log.exception(
            "Unhandled error on %s %s",
            request.method,
            request.url.path,
            extra={"request_id": getattr(request.state, "request_id", None)},
        )
        return JSONResponse(
            status_code=500,
            content={"code": "internal_error", "message": "Internal server error"},
        )

    @app.get("/authentik-callback-error", include_in_schema=False)
    async def authentik_callback_error():
        # Recovery target for a reverse-proxy errors middleware: an occasional
        # 400 from the Authentik OAuth callback is rewritten to a redirect
        # back into the app instead of a dead error page.
        return RedirectResponse("/", status_code=303)

    static_dir = _static_dir()
    if static_dir is not None:
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
        log.info("Serving frontend from %s", static_dir)

    return app


def _static_dir() -> Path | None:
    configured = os.environ.get("SISYPHUS_STATIC_DIR")
    candidates = [Path(configured)] if configured else [
        Path(__file__).resolve().parents[3] / "frontend" / "dist",
    ]
    for candidate in candidates:
        if (candidate / "index.html").is_file():
            return candidate
    if configured:
        raise RuntimeError(f"SISYPHUS_STATIC_DIR={configured} has no index.html")
    return None


def _any_board(config):
    return config.boards[0]


app = create_app()
