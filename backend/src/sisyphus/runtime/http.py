"""HTTP hardening middleware: request IDs, access logs, auth, origin guard.

Auth posture (architecture plan §11):
- SISYPHUS_AUTH selects the mode: "basic", "proxy", or "none".
- "none" must be explicit when running against a real replica
  (SISYPHUS_REPOSITORY=cli); the fake development repository defaults to
  "none" with a warning so `task dev:backend` stays frictionless.
- basic: SISYPHUS_AUTH_USER + SISYPHUS_AUTH_PASSWORD, compared with
  constant-time equality. The browser's native Basic Auth prompt is the UI.
- proxy: a trusted reverse proxy authenticates and sets the header named by
  SISYPHUS_AUTH_PROXY_HEADER (default X-Authenticated-User). The proxy MUST
  strip that header from client traffic.

CSRF posture: when auth is enabled, state-changing requests carrying an
Origin header must match the request Host (same-origin deployment) or one of
SISYPHUS_ALLOWED_ORIGINS (comma-separated, scheme://host[:port]). Requests
without an Origin header (curl, non-browser clients) pass — Basic/proxy auth
still applies to them.
"""

from __future__ import annotations

import base64
import logging
import os
import secrets
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

log = logging.getLogger("sisyphus.http")

AUTH_EXEMPT_PATHS = {"/api/v1/health"}
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class AuthSettings:
    def __init__(self) -> None:
        repo_kind = os.environ.get("SISYPHUS_REPOSITORY", "fake")
        mode = os.environ.get("SISYPHUS_AUTH")
        if mode is None:
            if repo_kind == "cli":
                raise RuntimeError(
                    "SISYPHUS_AUTH is required when SISYPHUS_REPOSITORY=cli. "
                    "Set it to 'basic', 'proxy', or explicitly 'none'."
                )
            mode = "none"
            log.warning("SISYPHUS_AUTH unset; defaulting to 'none' (fake repository)")
        if mode not in {"none", "basic", "proxy"}:
            raise RuntimeError(f"Unknown SISYPHUS_AUTH mode: {mode!r}")
        self.mode = mode
        self.user = os.environ.get("SISYPHUS_AUTH_USER", "")
        self.password = os.environ.get("SISYPHUS_AUTH_PASSWORD", "")
        self.proxy_header = os.environ.get(
            "SISYPHUS_AUTH_PROXY_HEADER", "X-Authenticated-User"
        )
        self.allowed_origins = {
            o.strip().rstrip("/")
            for o in os.environ.get("SISYPHUS_ALLOWED_ORIGINS", "").split(",")
            if o.strip()
        }
        if mode == "basic" and (not self.user or not self.password):
            raise RuntimeError(
                "SISYPHUS_AUTH=basic requires SISYPHUS_AUTH_USER and SISYPHUS_AUTH_PASSWORD"
            )

    def check_basic(self, header: str | None) -> bool:
        if not header or not header.startswith("Basic "):
            return False
        try:
            decoded = base64.b64decode(header[6:]).decode()
            user, _, password = decoded.partition(":")
        except Exception:
            return False
        return secrets.compare_digest(user, self.user) and secrets.compare_digest(
            password, self.password
        )


def _origin_allowed(request: Request, settings: AuthSettings) -> bool:
    origin = request.headers.get("origin")
    if not origin:
        return True
    origin = origin.rstrip("/")
    if origin in settings.allowed_origins:
        return True
    host = request.headers.get("host", "")
    return origin.split("://", 1)[-1] == host


def install_http_middleware(app: FastAPI) -> None:
    settings = AuthSettings()
    app.state.auth_settings = settings

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id
        started = time.monotonic()

        api_call = request.url.path.startswith("/api/")

        if settings.mode != "none" and api_call and request.url.path not in AUTH_EXEMPT_PATHS:
            if settings.mode == "basic":
                if not settings.check_basic(request.headers.get("authorization")):
                    return JSONResponse(
                        status_code=401,
                        content={"code": "unauthorized", "message": "Authentication required"},
                        headers={
                            "WWW-Authenticate": 'Basic realm="Sisyphus"',
                            "X-Request-ID": request_id,
                        },
                    )
            elif settings.mode == "proxy" and not request.headers.get(settings.proxy_header):
                return JSONResponse(
                    status_code=401,
                    content={"code": "unauthorized", "message": "Authentication required"},
                    headers={"X-Request-ID": request_id},
                )
            if request.method in MUTATING_METHODS and not _origin_allowed(request, settings):
                return JSONResponse(
                    status_code=403,
                    content={"code": "origin_rejected", "message": "Cross-origin request rejected"},
                    headers={"X-Request-ID": request_id},
                )

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        if api_call:
            log.info(
                "%s %s -> %s",
                request.method,
                request.url.path,
                response.status_code,
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": round((time.monotonic() - started) * 1000, 1),
                },
            )
        return response
