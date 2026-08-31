# Sisyphus

Sisyphus is a private Kanban UI over Taskwarrior 3.x. Taskwarrior remains the source of truth; Sisyphus serves the browser application, projects Taskwarrior records into board columns, and translates UI actions into UUID-targeted Taskwarrior commands.

The production deployment identifier and environment variable prefix remain `taskboard`.

## Repository Layout

- `taskboard.py` - HTTP server, static routes, and JSON API
- `taskboard_board.py` - Taskwarrior-to-board projection
- `taskboard_runtime.py` - Taskwarrior execution and synchronization state
- `taskboard_service.py` - task mutations and optimistic concurrency
- `taskboard_validation.py` - request and environment validation
- `static/` - browser application and PWA assets
- `tests/` - Python unit and real-Taskwarrior integration tests
- `tests/browser/` - mocked and live-contract Playwright tests
- `docs/taskboard.md` - application behavior and model

## Local Tests

```bash
mise exec -- task validate
```

The Python integration test requires Taskwarrior 3.x. Browser dependencies and Chromium are installed from the locked Playwright package before browser tests run.

## Container

The repository root is the Docker build context:

```bash
docker build -t sisyphus:local .
```

At runtime, the image expects Taskwarrior configuration under `/config`, replica data under `/data`, and the TaskChampion encryption secret in `TASKBOARD_TASKCHAMPION_ENCRYPTION_SECRET`. See `entrypoint.sh` for the complete environment contract.

Deployment, reverse proxy, authentication, DNS, secret injection, and TaskChampion server lifecycle are owned by the consuming infrastructure repository.
