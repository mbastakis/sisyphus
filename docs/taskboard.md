# Sisyphus

Sisyphus is a Kanban UI for Taskwarrior. The deployment identifier, environment variables, and HTTP interface use the `taskboard` identifier.

## Model

Taskwarrior remains the source of truth. Sisyphus is a view/controller over a local Taskwarrior replica and can synchronize through a TaskChampion server.

| Board column | Taskwarrior state |
|---|---|
| Backlog | `status:pending` without `+next`, active `start`, `+waiting`, or an unfinished dependency |
| Ready | `status:pending +next` |
| Doing | active tasks started with `task <uuid> start` |
| Waiting | `+waiting`, native waiting state, or a pending/waiting dependency |
| Done | recently completed tasks |

Drag/drop and card buttons run normal Taskwarrior commands. There is no separate board-state database.

Selecting a card opens a task detail drawer. In addition to description, project, tags, priority, and due date, the drawer exposes native Taskwarrior annotations, `wait`, `scheduled`, and `depends` fields. Date fields accept keyboard entry or open the browser's calendar from their calendar button. Dependencies use a searchable picker over unfinished board tasks while storing stable Taskwarrior UUIDs. After selection, the matching search result remains visible as an Added task card with View and Remove actions instead of disappearing from the picker. A query without an exact match can create a new Backlog task in the current project and attach it atomically; attachment failure removes the new task. Direct UUID lookup enriches dependencies outside the recent Done window: pending and waiting tasks block, completed and deleted tasks resolve, and dangling UUIDs remain visible as Missing without blocking work. Dependency and dependent names link to their task when it is in the displayed window. Recurrence and parent metadata are shown read-only.

Cards default to project, priority, due or deferred state, unresolved blockers, and the first user tag. Compact relationship lines name the first unfinished prerequisite and the first task that a card blocks; counts indicate additional relationships, while the drawer retains the complete dependency detail. Triage exposes secondary card metadata, while Blocked and Waiting expose additional relationship context. Search includes annotations, dependency and dependent names, UUIDs, and task dates in addition to the visible description, project, tags, and identifiers.

Lifecycle actions can start, stop, complete, reopen, or delete a task; reopening moves the completed task back to Backlog. Completing a task that blocks unfinished work names those tasks before confirmation. Deletion requires confirmation and warns when it would leave unresolved dependencies. Every mutation targets a stable Taskwarrior UUID. The backend validates dependency cycles even though the picker removes cycle-producing candidates.

The drawer tracks editable values. Closing it, following a task relationship, or running a lifecycle action prompts before discarding unsaved changes. A successful save closes without another prompt.

Every edit, move, delete, dependency creation, and bulk change includes the task's last observed Taskwarrior `modified` timestamp. The backend syncs and verifies all timestamps before writing. A stale edit returns a conflict instead of overwriting another replica; the drawer names remotely changed fields and requires either Reload latest or Keep my edits. Bulk changes preflight every selected task and reject the whole batch before mutation when any task is stale.

The project filter lists active projects first and recently completed projects second, with alphabetical sorting inside each group. A project remains active while any displayed task is unfinished; completed-only projects remain available while their tasks are retained in the Done column.

Search, project, tag, priority, readiness, and due-state filters persist in browser storage and are reflected in the URL with the active focus view, sort, mobile column, and open task. Reloading or sharing a URL restores that state, while Back and Forward move through filter/view changes and open task drawers. Readiness can isolate actionable tasks, unresolved blockers, or tasks deferred by a future `wait` date. Due-state filters cover overdue, today, upcoming, and undated work. Clear filters removes the saved values.

The Views panel provides Today, Ready, Blocked, Waiting, and Triage focus views. Custom named views capture the current focus, filters, and card sort order in browser storage. Sorting can use due date, Taskwarrior urgency, recent modification, recent entry, or description; it changes presentation only and never writes task state.

Each card has an explicit selection control. Select visible or individual cards, then bulk-apply project, tags, priority, due date, or board column. Bulk operations use stable UUIDs and optimistic timestamps and execute under the same Taskwarrior lock as single-task mutations.

The compact sync card shows the last successful sync, task/column counts, and board freshness. Exact attempt, success, and generation timestamps remain in hover text. Failed syncs retain the last successful timestamp and show the Taskwarrior error; data older than five minutes is marked stale. Mutations also show Saving, Saved, Conflict, Offline, or retry feedback on the affected card and in an open drawer.

API requests do not follow authorization redirects as cross-origin fetches. When the browser session expires behind an authentication proxy, Sisyphus preserves a dirty task drawer in session storage, performs a top-level reauthentication, and restores the draft after returning. The `/authentik-callback-error` application route emits a redirect to `/` for proxy-managed callback recovery.

## Visual System

The interface uses dense alignment, neutral application chrome, progressive disclosure, keyboard-first interaction, and hierarchy from surface contrast. Catppuccin Mocha is the palette. Crust and Mantle define the application shell, Base is the workspace, Surface colors provide controls and cards, Lavender is the interaction accent, and semantic colors are reserved for task state. The UI uses no gradients or glass effects; low-contrast borders separate surfaces, while shadows are limited to floating menus and drawers.

The board is the dominant surface. Quick capture is a compact command row, sidebar sections are flat controls, and bulk triage becomes prominent only after selection. Cards omit secondary metadata in normal views. Empty columns use a quiet inline state. Desktop column headers stay visible while their cards scroll. Collapsed columns become horizontal summaries. A polite status region announces board actions. Drawer close restores the originating card, reduced-motion preferences remove animated scrolling, responsive breakpoints support browser zoom reflow, and increased-contrast and forced-color modes strengthen borders and focus outlines.

## Mobile Behavior

At widths up to 1120px, the filter sidebar becomes a hamburger menu drawer. At widths up to 860px, the board shows one column at a time behind horizontally scrollable column tabs. Sisyphus opens Doing first when it contains tasks, otherwise the first non-empty column.

Touch layouts disable card dragging in favor of the card Actions menu. The edit form opens as a scrollable bottom sheet.

Keyboard navigation uses one tab stop for the current card. `G` focuses the first visible card, `J`/`K` or vertical arrows move within a column, and `H`/`L` or horizontal arrows move between columns. Moving above the first card focuses its column header; `X` collapses or expands that column and Down returns to its first card. `Shift` plus horizontal arrows or `H`/`L` moves the task one adjacent column, while number keys `1` through `5` move it directly through Backlog, Ready, Doing, Waiting, and Done. `Enter` opens the focused task.

While the page is visible and no edit is in progress, Sisyphus refreshes and syncs every 60 seconds. Returning to a visible tab triggers a refresh.

## HTTP Interface

Read routes:

- `GET /`
- `HEAD /`
- `GET /manifest.json`
- `HEAD /manifest.json`
- `GET /static/*`
- `HEAD /static/*`
- `GET /healthz`
- `HEAD /healthz`
- `GET /authentik-callback-error`
- `GET /api/board`

Mutation and synchronization routes:

- `POST /api/sync`
- `POST /api/tasks`
- `POST /api/tasks/bulk`
- `POST /api/tasks/<uuid>/dependencies`
- `POST /api/tasks/<uuid>/move`
- `PATCH /api/tasks/<uuid>`
- `DELETE /api/tasks/<uuid>`

The optimistic concurrency contract uses each task's Taskwarrior `modified` timestamp as `expected_modified`. A mismatch returns HTTP 409 with `error` and `current_task`. Taskwarrior execution failures return HTTP 502 with `error`, `task_stdout`, and `task_stderr`. Validation errors return HTTP 400.

## Runtime Contract

The container entrypoint generates Taskwarrior configuration from environment variables, exports `TASKRC` and `TASKDATA`, and starts `taskboard.py`.

Important paths:

| Path | Purpose |
|---|---|
| `/app` | Application source and static assets |
| `/config` | Generated Taskwarrior configuration |
| `/data` | Local Taskwarrior and TaskChampion replica state |

The application supports internal Basic Auth through `TASKBOARD_USERNAME` and `TASKBOARD_PASSWORD`, or trusted-proxy operation through `TASKBOARD_ALLOW_NO_AUTH=1`. Deployment infrastructure is responsible for deciding which mode is appropriate and for protecting externally reachable HTML and API routes.

## Tests

`tests/test_taskboard.py` exercises board projection, synchronization state, UUID-targeted mutations, dependency handling, validation, conflicts, deletion, and HTTP error handling.

`tests/test_taskboard_integration.py` starts Sisyphus against an isolated temporary Taskwarrior database and exercises create, stale-edit rejection, inline dependency creation, bulk update, move, and delete through HTTP.

`tests/browser/tests/taskboard.spec.mjs` runs deterministic mocked browser regressions for URL/history restoration, filters, views, sorting, relationships, per-task mutation feedback, conflicts, bulk triage, inline dependencies, keyboard movement, focus restoration, reduced motion, forced colors, zoom reflow, sync failures, deletion warnings, and mobile layout.

`tests/browser/tests/live.spec.mjs` is a read-only contract suite for a deployed instance. The caller supplies `TASKBOARD_BASE_URL`; the suite blocks non-GET API methods.
