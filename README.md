# Sisyphus

A personal, Kanban-first PWA over Taskwarrior. Taskwarrior stays the canonical
system of record; Sisyphus adds a board-oriented HTTP API (FastAPI) and a
keyboard-driven React frontend themed with Nocturne Rose.

See `docs/architecture-plan.md` for the full architecture and
`docs/deployment.md` for the environment-variable table.

## Layout

```
backend/    FastAPI app (uv, src-layout `sisyphus` package)
frontend/   React + TypeScript + Vite PWA
config/     boards.yaml — server-side board definitions
tests/      browser/ — Playwright e2e (runs against fake data)
docs/       architecture plan, deployment reference
```

## Development (safe by default)

Development runs against an in-memory **fake** repository seeded with sample
tasks — your real Taskwarrior replica is never touched. The topbar shows a
`FAKE DATA` badge as a reminder.

```bash
task dev:backend    # uvicorn on 127.0.0.1:8422 (fake data, hot reload)
task dev:frontend   # Vite on http://localhost:5173 (proxies /api)
```

Talking to a real replica requires three explicit opt-ins:
`SISYPHUS_REPOSITORY=cli`, `SISYPHUS_TASKDATA`, and `SISYPHUS_TASKRC`
(plus `TZ` and `SISYPHUS_AUTH`). The backend refuses to guess any of them.

## Tests and checks

```bash
task test:backend     # backend unit + API tests
task test:e2e         # Playwright e2e against a production-style server (fake data)
task validate         # lint + typecheck + config check + all tests
task config:validate  # validate config/boards.yaml only
```

First e2e run: `task e2e:sync` installs Playwright and Chromium.

## Production

`task build:image` builds a multi-stage container: Node builds the frontend,
uv installs the backend, Taskwarrior 3.4.2 is compiled and pinned, and FastAPI
serves both the API and the built frontend on port 8080.

The entrypoint refuses to start without explicit `TZ`, `SISYPHUS_AUTH`, and
(for sync) `TASK_SYNC_ENCRYPTION_SECRET` + `TASK_SYNC_CLIENT_ID`. Mount
`/config` (boards.yaml, generated taskrc) and `/data` (the replica). Rank UDA
declarations for every configured board are generated into the taskrc at
startup. Do not run more than one instance against the same `/data`.
