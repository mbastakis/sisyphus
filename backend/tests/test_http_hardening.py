from base64 import b64encode
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sisyphus.config.check import main as check_main
from sisyphus.main import create_app
from sisyphus.runtime.http import AuthSettings

CONFIG = Path(__file__).resolve().parents[2] / "config" / "boards.yaml"


@pytest.fixture(autouse=True)
def _base_env(monkeypatch):
    monkeypatch.setenv("SISYPHUS_CONFIG", str(CONFIG))
    monkeypatch.setenv("SISYPHUS_REPOSITORY", "fake")
    monkeypatch.delenv("SISYPHUS_AUTH", raising=False)
    monkeypatch.delenv("SISYPHUS_ALLOWED_ORIGINS", raising=False)


def basic(user: str, password: str) -> dict:
    token = b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def test_fake_mode_defaults_to_no_auth():
    client = TestClient(create_app())
    assert client.get("/api/v1/boards").status_code == 200


def test_basic_auth_rejects_and_accepts(monkeypatch):
    monkeypatch.setenv("SISYPHUS_AUTH", "basic")
    monkeypatch.setenv("SISYPHUS_AUTH_USER", "me")
    monkeypatch.setenv("SISYPHUS_AUTH_PASSWORD", "secret")
    client = TestClient(create_app())
    resp = client.get("/api/v1/boards")
    assert resp.status_code == 401
    assert resp.headers["WWW-Authenticate"].startswith("Basic")
    assert client.get("/api/v1/health").status_code == 200  # exempt
    assert client.get("/api/v1/boards", headers=basic("me", "secret")).status_code == 200
    assert client.get("/api/v1/boards", headers=basic("me", "wrong")).status_code == 401


def test_proxy_auth_requires_header(monkeypatch):
    monkeypatch.setenv("SISYPHUS_AUTH", "proxy")
    client = TestClient(create_app())
    assert client.get("/api/v1/boards").status_code == 401
    assert (
        client.get("/api/v1/boards", headers={"X-Authenticated-User": "me"}).status_code
        == 200
    )


def test_origin_guard_on_mutations(monkeypatch):
    monkeypatch.setenv("SISYPHUS_AUTH", "basic")
    monkeypatch.setenv("SISYPHUS_AUTH_USER", "me")
    monkeypatch.setenv("SISYPHUS_AUTH_PASSWORD", "secret")
    client = TestClient(create_app())
    headers = basic("me", "secret") | {"Origin": "https://evil.example"}
    resp = client.post("/api/v1/sync", headers=headers)
    assert resp.status_code == 403
    assert resp.json()["code"] == "origin_rejected"
    # Same-origin (Origin matches Host) passes.
    ok = basic("me", "secret") | {"Origin": "http://testserver"}
    assert client.post("/api/v1/sync", headers=ok).status_code == 200
    # Explicit allow-list passes.
    monkeypatch.setenv("SISYPHUS_ALLOWED_ORIGINS", "https://kanban.example")
    client = TestClient(create_app())
    allowed = basic("me", "secret") | {"Origin": "https://kanban.example"}
    assert client.post("/api/v1/sync", headers=allowed).status_code == 200


def test_request_id_generated_and_echoed():
    client = TestClient(create_app())
    generated = client.get("/api/v1/health").headers["X-Request-ID"]
    assert len(generated) == 12
    echoed = client.get("/api/v1/health", headers={"X-Request-ID": "abc123"})
    assert echoed.headers["X-Request-ID"] == "abc123"


def test_cli_mode_requires_tz(monkeypatch):
    monkeypatch.setenv("SISYPHUS_REPOSITORY", "cli")
    monkeypatch.delenv("TZ", raising=False)
    with pytest.raises(RuntimeError, match="TZ must be set"):
        create_app()


def test_cli_mode_requires_explicit_auth(monkeypatch):
    monkeypatch.setenv("SISYPHUS_REPOSITORY", "cli")
    with pytest.raises(RuntimeError, match="SISYPHUS_AUTH is required"):
        AuthSettings()


def test_config_check_command(capsys):
    assert check_main([str(CONFIG)]) == 0
    out = capsys.readouterr().out
    assert "2 boards" in out
    assert "rank_uda=sisyphus_rank_lifecycle" in out
    assert "rank_uda=sisyphus_rank_project" in out
    assert check_main(["--taskrc-udas", str(CONFIG)]) == 0
    udas = capsys.readouterr().out
    assert "uda.sisyphus_rank_lifecycle.type=string" in udas
    assert "uda.sisyphus_rank_project.type=string" in udas
    assert check_main(["/nonexistent/boards.yaml"]) == 1
