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

## Projects and tags

Projects are the first-class way to organise work. Every exact project name
that has tasks in scope (pending, waiting, or completed in the last 14 days)
gets its own lifecycle board automatically under **Projects** in the board
switcher. Creating a task with a new project name makes a new board appear;
when the last task leaves scope the board disappears. Dotted Taskwarrior
projects remain exact: `work.sisyphus` does not invent a separate `work`
board or include sibling projects. `config/boards.yaml` is restricted to the
two core boards, Lifecycle and Daily.

Tags are never shown or edited in the UI. The only tag Sisyphus touches is
the board-managed Ready marker (`ready_tag`, default `next`, matching the
CLI convention `+next`): dragging a card between Backlog and Ready adds or
removes it. Tags set from the CLI still work and are visible under *Raw
details* in the task drawer.

All project boards share one rank UDA, `sisyphus_rank_project`; because each
task has one exact project, this is enough to preserve its manual position.
The container entrypoint declares it in the generated taskrc alongside the
core boards' rank UDAs.

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
