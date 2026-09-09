# Deployment reference

## Environment variables

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `TZ` | container: yes; dev: only for `cli` | — | Server timezone. Today, deadline attention, follow-up days, and date writes follow it. The backend refuses to guess. |
| `SISYPHUS_AUTH` | container: yes; dev fake mode: no | `none` (fake mode only, with warning) | `basic`, `proxy`, or explicit `none`. Required whenever `SISYPHUS_REPOSITORY=cli`. |
| `SISYPHUS_AUTH_USER` / `SISYPHUS_AUTH_PASSWORD` | with `basic` | — | Basic Auth credentials (constant-time comparison). |
| `SISYPHUS_AUTH_PROXY_HEADER` | no | `X-Authenticated-User` | Header a trusted reverse proxy sets after authenticating. The proxy MUST strip it from client traffic. |
| `SISYPHUS_ALLOWED_ORIGINS` | no | — | Comma-separated extra origins allowed for mutating requests (CSRF origin check). Same-origin always passes. |
| `SISYPHUS_REPOSITORY` | no | dev: `fake`; container: `cli` | Repository adapter. `fake` is in-memory seeded data; `cli` drives real Taskwarrior. |
| `SISYPHUS_TASKDATA` / `SISYPHUS_TASKRC` | with `cli` | container: generated | Replica location and taskrc for the CLI adapter. Both mandatory; the adapter refuses to fall back to `~/.taskrc`. |
| `SISYPHUS_CONFIG` | no | `config/boards.yaml` | Path to the boards YAML. |
| `SISYPHUS_STATIC_DIR` | no | `frontend/dist` if present | Built frontend to serve at `/`. |
| `SISYPHUS_HOST` / `SISYPHUS_PORT` | no | `0.0.0.0` / `8080` | Bind address (container). |
| `SISYPHUS_LOG_FORMAT` | no | dev: `plain`; container: `json` | `json` emits one structured object per line with request IDs. |
| `SISYPHUS_LOG_LEVEL` | no | `INFO` | Log level. |
| `SISYPHUS_SYNC_INTERVAL_SECONDS` | no | `30` | Background TaskChampion reconciliation interval. Reads remain local; successful imports notify connected browsers over SSE. |
| `SISYPHUS_CONFIG_DIR` / `SISYPHUS_DATA` | no | `/config` / `/data` | Container durable paths. |
| `TASK_SYNC_ENCRYPTION_SECRET` | container `cli`: yes* | — | TaskChampion sync encryption secret. *Or set `TASK_SYNC_DISABLED=1`. |
| `TASK_SYNC_CLIENT_ID` | with sync | — | TaskChampion client id. |
| `TASK_SYNC_SERVER_URL` | no | `http://taskchampion-sync:8080` | TaskChampion sync server. |
| `TASK_SYNC_DISABLED` | no | — | `1` runs a local-only replica without sync. |

## CSRF posture

- Mutating API requests carrying an `Origin` header must match the request
  `Host` or `SISYPHUS_ALLOWED_ORIGINS`; others get 403 (only enforced when
  auth is enabled). Non-browser clients without `Origin` pass the origin
  check but still authenticate.
- Deploy same-origin (one container serves frontend + API). No CORS is
  enabled by default.

## Operational notes

- One backend process per replica: never scale horizontally over one `/data`.
- The backend owns synchronization: it reconciles the Atlas replica in the background and wakes immediately after local mutations. The frontend listens for task-generation events over `/api/v1/events`; a minute-based refresh also updates date-sensitive views when a day or deferral boundary passes without a task edit.
- `/api/v1/health` is unauthenticated for probes; everything else is guarded.
- Backup = the `/config` and `/data` volumes. Restore by mounting them into a
  new container; the replica syncs against TaskChampion normally afterwards.
- Rollback = run the previous image tag with the same volumes; the API only
  reads/writes Taskwarrior data through the `task` CLI, so there are no
  schema migrations.
- Structured logs carry `request_id`; responses echo `X-Request-ID`.

## Planning field compatibility

The container and workstation taskrc must declare `sisyphus_plan` (date),
`sisyphus_blocker` (string), and `sisyphus_followup` (date). TaskChampion sync
transfers task values, not taskrc declarations. See ADR 0010 for their meanings.

Existing deadlines are preserved, including deadlines previously set by the
Daily board. Existing native `wait` dates mean deferral and remain discoverable
through deferred Tasks. There is no reliable automatic conversion from old
planning deadlines or date-based blockers.

Older application images do not understand the new blocker/Today semantics.
The data remains Taskwarrior-readable, but rolling the UI back does not preserve
the new user-facing behavior.

To check the native primitives against a built image without mounting host
data, run from the repository root:

```bash
docker run --rm -i --entrypoint python sisyphus:latest - < scripts/check-taskwarrior-contract.py
```

The script creates and removes its own temporary replica inside the container.
It checks date/string UDA export, cross-project dependency preservation, native
execution, deferral, and deadline preservation. Future `wait` can coexist with
exported `status:pending`; deferral must be derived from the timestamp.

`mise exec task -- task test:cli` checks the current application services against
the image's native binary as well. It mounts only source/config read-only and
creates a disposable replica, covering Today, cross-project prerequisites,
blocking, deferral attention, deadline preservation, history, and reopening.
