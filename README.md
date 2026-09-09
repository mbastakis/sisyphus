# Sisyphus

A personal, Kanban-first PWA over Taskwarrior. Taskwarrior stays the canonical
system of record; Sisyphus adds a board-oriented HTTP API (FastAPI) and a
keyboard-driven React frontend themed with Nocturne Rose.

See `CONTEXT.md` and `docs/adr/` for current product decisions,
`docs/architecture-plan.md` for the original architecture plan, and
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

Projects are inferred from exact Taskwarrior project names. Active projects
have committed unfinished work; Later contains only backlog or deferred work;
History makes completed-only projects searchable beyond the recent Done window.
Changing groups does not navigate away from an open project. Dotted names remain
exact: `work.sisyphus` does not invent a separate `work` board or include siblings.
There are no independent project statuses to maintain.

There is no categorization-tag workflow. `+next` is the internal commitment
marker shared with the agent: committing work adds it, and withdrawing
commitment removes it. Starting work establishes commitment; blockers and
deferral preserve it. Existing unrelated Taskwarrior data is not automatically
rewritten.

All project boards share one rank UDA, `sisyphus_rank_project`; because each
task has one exact project, this is enough to preserve its manual position.
The container entrypoint declares it in the generated taskrc alongside the
core boards' rank UDAs.

## Working with Tasks

Lifecycle is the default: capture in Backlog, commit a small pool to Ready,
start work in Doing, and complete it in Done. Waiting means committed work has
a real blocker; postponing work is a separate Defer action. A break or a new
day does not require stopping and restarting a Task.

Today (stable board ID `daily`) shows ongoing work and Tasks deliberately chosen
for today. Due/overdue Tasks and blocker follow-ups appear for attention without
automatically becoming daily commitments. Planning is optional: pull directly
from the inline Ready preview and start, or drag between Ready, Up next, and Doing.
The command palette includes Go to Today. Deferred, attention, and completed-today
panels are keyboard-accessible and dismiss on outside click.
Unfinished daily selections remain reviewable rather than
silently rolling forward.

Deadlines use `due`, deferral uses `wait`, and commitment uses `+next`. Three
UDAs hold chosen day (`sisyphus_plan`), the current external blocker
(`sisyphus_blocker`), and its review day (`sisyphus_followup`). See
`docs/adr/0010-taskwarrior-field-mapping.md` for the shared field contract.
Native `scheduled` is not repurposed as daily intent.

See [Using Sisyphus](docs/workflow.md) for the short user-facing workflow.

## Development (safe by default)

Development runs against an in-memory **fake** repository seeded with sample
tasks — your real Taskwarrior replica is never touched. The topbar shows a
`FAKE DATA` badge as a reminder.

```bash
mise exec task -- task dev:backend    # uvicorn on 127.0.0.1:8422 (fake data, hot reload)
mise exec task -- task dev:frontend   # Vite on http://localhost:5173 (proxies /api)
```

Talking to a real replica requires three explicit opt-ins:
`SISYPHUS_REPOSITORY=cli`, `SISYPHUS_TASKDATA`, and `SISYPHUS_TASKRC`
(plus `TZ` and `SISYPHUS_AUTH`). The backend refuses to guess any of them.

## Tests and checks

Install the native pre-commit and pre-push hooks with
`mise exec task -- task hooks:install`. See [Releases and local hooks](docs/releases.md)
for dependency setup, validation scope, and the release procedure.

```bash
mise exec task -- task test:backend     # backend unit + API tests
mise exec task -- task test:e2e         # Playwright e2e against a production-style server (fake data)
mise exec task -- task validate         # lint + typecheck + config check + all tests
mise exec task -- task config:validate  # validate config/boards.yaml only
```

First e2e run: `mise exec task -- task e2e:sync` installs Playwright and Chromium.

With a built image available, `mise exec task -- task test:taskwarrior` checks
native planning primitives against its Taskwarrior binary in a disposable
container replica. Override the image with `IMAGE=sisyphus:<tag>`.
`mise exec task -- task test:cli` additionally checks current application services
against that binary, mounting only read-only source and config into the container.

## Theme updates

The frontend consumes the committed native package in
`frontend/vendor/nocturne-rose`. Manually copy the premade contents of the theme
repository's `dist/sisyphus/` into that directory, removing obsolete package files
when the distribution changes. From this repository root, run:

```bash
mise exec task -- task icons:generate icons:check build:frontend
```

If the package metadata changes, refresh the frontend lockfile and install
dependencies using the normal npm workflow. Color-only updates need no dependency
changes.

Review and commit the package and regenerated
`frontend/public/icons/` assets together. Icon generation and verification are
app-owned commands using the local package. Build and deploy the production image
through the normal application workflow.

## Production

Release-tag pushes publish `ghcr.io/mbastakis/sisyphus` for `linux/amd64`.
Deployment selects a published image digest and its full source commit explicitly.
See [Releases and local hooks](docs/releases.md) for artifact metadata and initial
public GHCR package setup.

`mise exec task -- task build:image` builds a multi-stage container: Node builds the frontend,
uv installs the backend, Taskwarrior 3.4.2 is compiled and pinned, and FastAPI
serves both the API and the built frontend on port 8080.

The entrypoint refuses to start without explicit `TZ`, `SISYPHUS_AUTH`, and
(for sync) `TASK_SYNC_ENCRYPTION_SECRET` + `TASK_SYNC_CLIENT_ID`. Mount
`/config` (boards.yaml, generated taskrc) and `/data` (the replica). Rank UDA
declarations for every configured board are generated into the taskrc at
startup. Do not run more than one instance against the same `/data`.
