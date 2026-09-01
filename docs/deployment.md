# Deployment reference

## Environment variables

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `TZ` | container: yes; dev: only for `cli` | — | Server timezone. Date-relative columns (`due:today`, Overdue) and date writes follow it. The backend refuses to guess. |
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
- `/api/v1/health` is unauthenticated for probes; everything else is guarded.
- Backup = the `/config` and `/data` volumes. Restore by mounting them into a
  new container; the replica syncs against TaskChampion normally afterwards.
- Rollback = run the previous image tag with the same volumes; the API only
  reads/writes Taskwarrior data through the `task` CLI, so there are no
  schema migrations.
- Structured logs carry `request_id`; responses echo `X-Request-ID`.
