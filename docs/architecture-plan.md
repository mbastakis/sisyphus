# Sisyphus Rewrite Plan

## 1. Product Definition

Sisyphus will be a personal, Kanban-first, responsive web application for the Taskwarrior task universe.

Taskwarrior remains the canonical system of record. Sisyphus does not introduce another task database and does not synchronize a shadow task model with Taskwarrior. The backend works through the Taskwarrior CLI so normal Taskwarrior configuration, hooks, UUIDs, TaskChampion synchronization, and CLI clients continue to behave as the authoritative task system.

Sisyphus adds two things around that system of record:

1. A stable product-specific HTTP API that translates Taskwarrior behavior into board-oriented operations.
2. Core Lifecycle and Daily Boards plus exact per-project Boards generated from the Task Universe.

The product is intentionally:

- single-user;
- Kanban-first and mostly Kanban-only;
- minimal in visual and conceptual surface area;
- keyboard-driven on desktop;
- touch-friendly and intentionally redesigned for mobile;
- installable as a PWA;
- read-only when the browser is offline;
- themed with a vendored Nocturne Rose token set;
- configured through server-side YAML for the Lifecycle and Daily core Boards;
- implemented as a cleanly separated React frontend and Python FastAPI backend.

## 2. Decisions Reached

### System of record

Taskwarrior and its local TaskChampion replica remain canonical. Every core task must remain usable from ordinary Taskwarrior clients. Sisyphus-specific task metadata is allowed only where Taskwarrior has no native equivalent, and must be stored as documented Taskwarrior UDAs rather than in a second database.

### Client and deployment

The first-class client is a responsive web/PWA served from the home server. The backend owns Taskwarrior access and TaskChampion synchronization. There is no desktop-only or native-mobile requirement for the first release.

### User model

Sisyphus is personal and single-user. It has no workspaces, tenants, assignees, memberships, sharing, comments-as-collaboration, or permission model.

### Frontend foundation

The frontend will be product-owned React rather than a fork of a complete Kanban application. The recommended foundation is:

- React and TypeScript;
- Vite;
- dnd-kit for board movement and ordering;
- React Aria for accessible interaction primitives and focus management;
- TanStack Query for server state and mutation reconciliation;
- vite-plugin-pwa for installation and offline shell caching;
- semantic CSS custom properties for Nocturne Rose;
- generated TypeScript types or client bindings from FastAPI OpenAPI.

### Backend foundation

The backend will use Python FastAPI and Pydantic. Taskwarrior access will sit behind an internal repository port with one production implementation: the Taskwarrior CLI adapter.

The HTTP API remains explicitly Sisyphus-shaped. It is not a universal task protocol, a Vikunja/Planka compatibility API, or a promise that arbitrary backends can implement every Taskwarrior concept.

### Board model

The full set of tasks is the Task Universe. A Board is a named lens over that universe. Boards may overlap.

Each Board defines:

- a stable ID;
- a display name and optional description;
- a Board Scope selecting tasks;
- a Column Mapping that determines column placement;
- explicit write behavior for writable columns;
- ordering mode;
- visible card fields;
- optional secondary filters or views;
- mobile defaults;
- optional rank UDA for persistent manual ordering.

### Initial Boards

The first release has two core Boards and one generated Board kind:

1. Lifecycle Board: Backlog, Ready, Doing, Waiting, Done.
2. Daily Board: Overdue, Today, Upcoming, No date.
3. Project Board: the lifecycle mapping scoped to one exact Taskwarrior project name, generated whenever tasks use that project.

Dotted projects remain exact values: a task in `work.sisyphus` generates that Board only, not a synthetic `work` ancestor Board. Projects-as-columns is not in the initial scope.

### Computed columns

Computed Boards may contain read-only and writable columns.

A move is allowed only when the destination has an explicit write rule. Examples:

- dropping into Today sets `due:today`;
- dropping into No date clears `due`;
- dropping into Upcoming requests a date instead of guessing one;
- Overdue is normally read-only because no single field value means overdue.

### Persistent ordering

A Board configured for manual ordering stores a separate rank for each Task and Board. The intended UDA is conceptually `sisyphus.rank.<board-id>`, subject to validation against Taskwarrior UDA naming constraints during implementation.

Board IDs are immutable identifiers. Renaming a Board does not change its ID or rank field.

Boards using computed ordering do not create rank metadata.

### Configuration

The Lifecycle and Daily Board definitions live in a server-side YAML file, which accepts exactly those two stable Board IDs. Project Boards are generated automatically from exact Taskwarrior project names and are not configurable. The first release has no in-app Board editor. Configuration is hand-edited, validated at startup and through a CLI/check command, and returned read-only to the browser through the API.

Device-local presentation preferences may stay in browser storage. Task meaning, core Board definitions, and shared saved views do not.

### Offline behavior

The PWA caches the application shell and the last successfully loaded Board for offline inspection. Mutations require backend connectivity. There is no browser mutation outbox, offline conflict resolver, or second local task replica in the first release.

### Theme

Sisyphus vendors a generated semantic package from the canonical `mbastakis/nocturne-rose` palette repository. The committed snapshot keeps builds independent of sibling repositories and is refreshed explicitly with `task theme:sync`.

The initial source palette is:

| Token | Value |
|---|---|
| Black | `#09090b` |
| Base | `#0d0d10` |
| Mantle | `#121217` |
| Surface | `#18181f` |
| Overlay | `#22222c` |
| Overlay high | `#30303d` |
| Text | `#ebe7ed` |
| Subtext | `#aaa5b0` |
| Muted | `#77727f` |
| Disabled | `#504c57` |
| Rose | `#d48aa4` |
| Rose bright | `#e3a0b8` |
| Rose dim | `#7c4659` |
| Orchid | `#b69acb` |
| Blue | `#88a8bd` |
| Aqua | `#94b3ae` |
| Green | `#8aa47f` |
| Yellow | `#b7aa7d` |
| Amber | `#d3b069` |
| Red | `#cc655c` |

Semantic roles must be named by purpose, not palette color. For example: `--canvas`, `--surface-card`, `--text-primary`, `--accent`, `--focus-ring`, `--status-success`, and `--status-danger`.

## 3. Research Outcome

No complete open-source Kanban frontend is a better architectural fit than a product-owned frontend for these requirements.

### Strong references

#### angelcabo/taskwarrior-kanban

Repository: https://github.com/angelcabo/taskwarrior-kanban

This is the closest domain match. It already explores Taskwarrior filters, attribute-driven columns, multiple Boards, optimistic movement, and a React frontend. It is useful as a source of product concepts and selectively portable MIT-licensed code.

It is not recommended as the base because it is young, bundles another backend, lacks PWA support, configures pointer-only board dragging, and needs substantial keyboard, accessibility, and mobile work.

#### Vikunja

Repository: https://github.com/go-vikunja/vikunja

Vikunja is the strongest conventional web task manager reference. Its responsive task UI, service separation, and multiple views are worth studying. Its frontend still assumes Vikunja projects, project views, relations, users, permissions, and API semantics. Forking it would require removing another product domain rather than building Sisyphus.

#### Super Productivity

Repository: https://github.com/super-productivity/super-productivity

Super Productivity is the strongest personal-productivity and local-first reference. It is useful for keyboard workflows, focus views, issue-provider concepts, and cross-platform UX. It is not primarily a refined, minimal Kanban frontend, and its Angular application is much larger than needed.

#### Kanri

Repository: https://github.com/kanriapp/kanri

Kanri is a strong minimal personal Kanban reference with good customization. It is desktop-first through Tauri and GPL-licensed, so it is not the best foundation for the selected server-hosted PWA architecture.

### Visual and interaction references only

- Plane: excellent polish, but vastly over-scoped and backend-coupled.
- Planka: polished Trello-like experience, but source-available rather than straightforward OSI open source and tightly coupled to its server.
- Focalboard: useful board/property UI ideas, but unmaintained and AGPL-based.
- Wekan: active and MIT, but deeply coupled to Meteor.
- Kanboard: permissive and simple, but server-rendered and in maintenance mode.
- Leantime: useful personal dashboard ideas, but an integrated project-management product rather than a detachable Kanban frontend.

### Library conclusion

The reusable open-source layer should be interaction primitives, not an inherited product:

- dnd-kit: https://github.com/clauderic/dnd-kit
- React Aria: https://github.com/adobe/react-spectrum
- TanStack Query: https://github.com/TanStack/query
- vite-plugin-pwa: https://github.com/vite-pwa/vite-plugin-pwa

## 4. Target Repository Layout

The rewrite should replace the current flat structure with explicit frontend/backend boundaries:

```text
sisyphus/
├── backend/
│   ├── pyproject.toml
│   ├── src/sisyphus/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── boards.py
│   │   │   ├── tasks.py
│   │   │   ├── sync.py
│   │   │   └── system.py
│   │   ├── application/
│   │   │   ├── board_service.py
│   │   │   ├── task_service.py
│   │   │   └── sync_service.py
│   │   ├── domain/
│   │   │   ├── board.py
│   │   │   ├── task.py
│   │   │   ├── commands.py
│   │   │   └── errors.py
│   │   ├── repositories/
│   │   │   ├── task_repository.py
│   │   │   └── taskwarrior_cli.py
│   │   ├── config/
│   │   │   ├── loader.py
│   │   │   ├── models.py
│   │   │   └── validation.py
│   │   └── runtime/
│   │       ├── subprocess.py
│   │       ├── locking.py
│   │       └── sync_state.py
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── contract/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── app/
│   │   ├── api/
│   │   ├── boards/
│   │   ├── tasks/
│   │   ├── commands/
│   │   ├── components/
│   │   ├── theme/
│   │   └── test/
│   └── e2e/
├── config/
│   ├── boards.example.yaml
│   └── README.md
├── docs/
│   ├── adr/
│   ├── architecture-plan.md
│   └── taskboard.md
├── CONTEXT.md
├── Dockerfile
├── Taskfile.yml
└── README.md
```

This is a modular monorepo, not separate deployable repositories. One container may serve the built frontend and API, but the source and test boundaries remain explicit.

## 5. Domain Model

### Task

A Task is a normalized representation of a Taskwarrior record. The domain model should preserve recognized Taskwarrior fields and carry unknown fields in a read-only raw map.

Suggested core shape:

```text
Task
- uuid
- description
- status
- project
- tags
- priority
- due
- wait
- scheduled
- start
- entry
- modified
- end
- urgency
- annotations
- dependencies
- recurrence metadata
- known Sisyphus metadata
- raw fields
```

`modified` remains the optimistic concurrency token unless implementation evidence shows that Taskwarrior exposes a stronger revision identifier.

### Board

A Board is configuration, not persisted task state.

```text
Board
- id
- name
- description
- scope
- columns
- ordering
- card layout
- default view
- mobile behavior
```

### Board Scope

A Board Scope selects tasks. The first implementation should use Taskwarrior filter expressions evaluated by the backend, not a second browser query language.

Scopes must be treated as trusted administrator configuration because Taskwarrior filter syntax is expressive. The YAML validator must still reject malformed or unsupported constructs and must never concatenate unvalidated browser input into shell commands.

### Column

A Column has separate read and write semantics:

```text
Column
- id
- name
- color role
- match rule
- write rule or read-only marker
- WIP limit, optional and display-only initially
- completion behavior
```

Separating match and write rules is required because computed conditions are not always invertible.

Examples:

- `due.before:today` can match Overdue, but cannot define a unique drop mutation.
- `due:today` can both match and define a write operation.
- an unresolved dependency can place a Task in Waiting, but dropping into Waiting needs an explicit tag or field mutation.

### Board Projection

A Board Projection is the API response used by React. It contains already selected, classified, ordered, and enriched cards.

It should include:

- Board metadata;
- generation and sync metadata;
- columns in configured order;
- cards in display order;
- per-card allowed actions;
- per-column accepted move behavior;
- dependency summaries;
- available projects/tags when needed by the current Board;
- concurrency versions.

The frontend must not independently reimplement Taskwarrior column classification.

## 6. YAML Configuration Design

The exact schema should be developed with Pydantic and documented through examples. A target shape is:

```yaml
version: 1

boards:
  - id: lifecycle
    name: Lifecycle
    description: All active work by Taskwarrior lifecycle
    template: lifecycle
    scope:
      filter: status:pending or status:waiting or status:completed
      completed_days: 14
    ordering:
      mode: manual
      rank_uda: sisyphus_rank_lifecycle
      fallback:
        - urgency: desc
        - entry: asc
    cards:
      fields:
        - project
        - priority
        - due
        - blockers
        - first_tag
    columns:
      - id: backlog
        name: Backlog
        match:
          preset: backlog
        write:
          preset: backlog
      - id: ready
        name: Ready
        match:
          preset: ready
        write:
          preset: ready
      - id: doing
        name: Doing
        match:
          preset: doing
        write:
          preset: doing
      - id: waiting
        name: Waiting
        match:
          preset: waiting
        write:
          preset: waiting
      - id: done
        name: Done
        match:
          preset: done
        write:
          preset: done

  - id: daily
    name: Daily
    template: daily
    scope:
      filter: status:pending or status:waiting
    ordering:
      mode: computed
      by:
        - due: asc
        - urgency: desc
    columns:
      - id: overdue
        name: Overdue
        match:
          filter: due.before:today
        write: null
      - id: today
        name: Today
        match:
          filter: due:today
        write:
          set:
            due: today
      - id: upcoming
        name: Upcoming
        match:
          filter: due.after:today
        write:
          prompt:
            field: due
            input: date
      - id: no-date
        name: No date
        match:
          filter: due.none:
        write:
          clear:
            - due
```

### Lifecycle preset semantics

The lifecycle presets must be pinned down in Taskwarrior terms during Phase 3; "preset: waiting" is not self-explanatory. The default mapping is:

| Column | Match rule | Write rule on drop |
|---|---|---|
| Backlog | `status:pending`, not active, no `ready` tag | stop if active, remove `ready` tag, clear `wait` |
| Ready | `status:pending`, `+ready`, not active | add `ready` tag, stop if active, clear `wait` |
| Doing | `status:pending` and active (`start` set) | `task start` |
| Waiting | `status:waiting` (future `wait` date) | prompt for a `wait` date (same prompt mechanism as the Daily board's Upcoming column) |
| Done | `status:completed` within `completed_days` | `task done` |

Additional rules that fall out of this mapping:

- Waiting cannot be a deterministic `set` because `wait` requires a date. It must use the declared-prompt mechanism. This means the prompt mechanism is required by the lifecycle preset, not only by the Daily board.
- Dragging a card out of Done is a reopen (`status:pending`) plus the destination column's write rule.
- Dragging a card out of Doing always includes `task stop` before applying the destination write rule.
- Doing takes precedence over Ready when a task is both active and tagged `ready` (configured column order resolves this by default).
- The `ready` tag name must be configurable per board template, because users may already use `+next` or similar conventions.

### Configuration constraints

- `version` is mandatory.
- Board IDs and column IDs are stable machine identifiers.
- IDs use a conservative ASCII slug format.
- Board names are presentation-only and may change freely.
- Rank UDA names are explicit and unique.
- Every configured rank UDA must be declared in the generated Taskwarrior configuration (`uda.<name>.type=string`, plus a label). Undeclared UDAs cause Taskwarrior warnings or data-handling surprises, and other Taskwarrior clients sharing the replica need the declarations too. Startup validation must verify that declarations exist for every configured rank UDA.
- Every writable column has a deterministic mutation or a declared prompt.
- Read-only columns reject drops in the API as well as the UI.
- A Board must define how tasks matching multiple columns are resolved: configured priority/order is the default.
- A Board must define what happens to tasks matching no column: omit, place in a fallback column, or surface as configuration errors. The recommended default is a visible Unmapped diagnostic group in development and rejection during strict production validation.
- Configuration reload should initially require process restart. Hot reload is not required for the first release.
- A validation command must parse the file, verify IDs, compile filters, verify UDA names, and dry-run representative Taskwarrior queries without mutation.

## 7. Backend Architecture

### API layer

FastAPI routes perform transport concerns only:

- authentication boundary integration;
- request parsing;
- response serialization;
- HTTP status mapping;
- request IDs;
- OpenAPI generation.

Routes must not construct Taskwarrior command arguments directly.

### Application layer

Application services coordinate use cases:

- load Board projection;
- create Task in Board context;
- update Task fields;
- move Task to a column;
- reorder Task within a Board;
- complete/reopen/delete Task;
- add/remove dependencies;
- append annotations;
- perform bulk mutations;
- synchronize the local replica;
- validate Board configuration.

This layer owns optimistic concurrency checks and mutation planning.

### Domain layer

The domain layer defines:

- normalized Task and Board types;
- column matching and precedence;
- mutation commands;
- rank behavior;
- dependency semantics;
- capability and allowed-action calculation;
- domain errors.

It must not depend on FastAPI, subprocesses, or Pydantic transport models.

### Repository port

The internal repository interface should model Sisyphus needs without pretending to be backend-neutral at all costs.

A plausible interface includes:

```python
class TaskRepository(Protocol):
    def sync(self) -> SyncResult: ...
    def query(self, filter: TaskFilter) -> list[Task]: ...
    def get(self, uuid: UUID) -> Task | None: ...
    def create(self, command: CreateTask) -> Task: ...
    def apply(self, uuid: UUID, commands: list[TaskMutation]) -> Task: ...
    def delete(self, uuid: UUID) -> None: ...
```

The port exists to isolate subprocess behavior, make domain tests deterministic, and permit a future direct TaskChampion adapter if there is a concrete reason. It does not justify maintaining multiple production adapters now.

### Taskwarrior CLI adapter

The CLI adapter must:

- invoke subprocesses without a shell;
- use UUIDs for all existing-task mutations;
- place free-form descriptions after `--` where appropriate;
- set explicit noninteractive and JSON output overrides;
- use a controlled locale;
- enforce subprocess timeouts;
- capture structured diagnostics;
- parse JSON exports defensively;
- isolate human-output parsing, especially task creation;
- serialize mutation sequences under one process lock;
- document behavior when multiple Sisyphus processes share one replica;
- preserve Taskwarrior hooks and normal Taskwarrior semantics.

Taskwarrior 3.x should remain pinned in the container. Adapter integration tests must run against the exact pinned version.

### Time and timezone policy

Date-relative filters such as `due:today` and `due.before:today` are evaluated by Taskwarrior on the server, using the server process timezone. If the container runs in UTC while the user lives in Europe/Athens, the Daily board misclassifies tasks around midnight and the `due:today` write rule sets the wrong day.

Policy for the first release:

- the container requires an explicit `TZ` environment variable and refuses to guess; validation fails loudly if it is unset;
- `GET /api/v1/system` reports the server timezone;
- the frontend compares the reported timezone against the browser timezone and shows a persistent warning banner when they differ, because column membership and date writes will then disagree with the user's wall clock;
- per-request timezone override is explicitly out of scope (single-user product, one home timezone).

### Sync policy

The current code tolerates automatic sync failure and continues against the local replica. Preserve this offline-tolerant server behavior, but state it accurately:

1. Attempt sync before a read or mutation according to policy.
2. If automatic sync fails, expose degraded sync state and continue with locally available data.
3. Check `expected_modified` against the local post-attempt state.
4. Apply the mutation locally.
5. Attempt sync after mutation.
6. Return the local result plus sync status.

An explicit user-requested sync should report failure directly.

The UI must not claim that a failed pre-write sync verified the latest remote state.

### Locking and process model

The first deployment remains one backend process owning one Taskwarrior replica. A process-local lock serializes command sequences.

The server should not be horizontally scaled against one shared `/data` path. This constraint must be documented in deployment configuration.

Every subprocess must have a timeout. A hung sync must not hold the global lock indefinitely.

### Rank algorithm

Use sparse fractional or lexicographic ranks so ordinary moves usually update one Task rather than every Task in a column.

Requirements:

- stable ordering after refresh and sync;
- independent order per Board;
- deterministic fallback when ranks are absent or duplicated;
- bounded rank growth;
- occasional rebalance under the repository lock;
- optimistic concurrency on the moved Task;
- explicit behavior if another client edits the rank UDA.

Do not use dense integer positions that require rewriting an entire column for every insertion.

## 8. HTTP API Plan

Use versioned routes from the first rewrite, for example `/api/v1`.

### System routes

- `GET /api/v1/health`
- `GET /api/v1/system`
- `POST /api/v1/sync`

`system` returns application version, Taskwarrior version, config version, server timezone, sync status, and relevant capabilities without exposing secrets or raw taskrc contents.

### Board routes

- `GET /api/v1/boards`
- `GET /api/v1/boards/{board_id}`
- `POST /api/v1/boards/{board_id}/tasks`
- `POST /api/v1/boards/{board_id}/tasks/{uuid}/move`
- `POST /api/v1/boards/{board_id}/tasks/{uuid}/reorder`
- `POST /api/v1/boards/{board_id}/bulk`

The Board projection route may initially return the full Board because the product is personal and task counts are expected to be moderate. The DTO should still support an eventual cursor or incremental revision without redesigning every card.

### Task routes

- `GET /api/v1/tasks/{uuid}`
- `PATCH /api/v1/tasks/{uuid}`
- `DELETE /api/v1/tasks/{uuid}`
- `POST /api/v1/tasks/{uuid}/complete`
- `POST /api/v1/tasks/{uuid}/reopen`
- `POST /api/v1/tasks/{uuid}/start`
- `POST /api/v1/tasks/{uuid}/stop`
- `POST /api/v1/tasks/{uuid}/annotations`
- `PUT /api/v1/tasks/{uuid}/dependencies`

Separate lifecycle endpoints are clearer than overloading a generic patch with Taskwarrior command semantics. They may internally share command types.

### Mutation contract

Every mutation of an existing Task includes `expected_modified`.

On conflict, return HTTP 409 with:

- stable error code;
- human-readable message;
- current Task projection;
- changed known fields where calculable;
- current sync status.

Validation failures return HTTP 422 using a stable application error envelope rather than leaking Pydantic internals directly.

Taskwarrior failures return HTTP 502 with a stable code and sanitized diagnostic details. Full command diagnostics belong in server logs; the browser should receive only safe and actionable information.

### OpenAPI and frontend types

FastAPI OpenAPI is the source for frontend transport types. Generate TypeScript types during validation and fail CI if generated types are stale.

Domain types inside React may wrap generated DTOs but must not hand-copy API field definitions.

## 9. Frontend Architecture

### Application shell

The shell contains:

- compact top bar with Board switcher, search, sync state, and create action;
- dominant Board surface;
- optional filter/view drawer rather than a permanently heavy sidebar;
- task details drawer on desktop;
- task details bottom sheet on mobile;
- command palette;
- keyboard help overlay;
- toast/live region for mutation and sync feedback.

Avoid dashboards, analytics panels, activity feeds, team navigation, and generic project-management chrome.

Shell metrics for the desktop layout:

- top bar: 48px tall, flat `--shell` background with a 1px `--border-subtle` bottom hairline; contents are Board switcher (Board name + chevron, opens with `B`), search field (focused by `/`), sync indicator, and a primary Create button;
- board surface: fills the remaining viewport; columns scroll horizontally inside it (Shift+wheel scrolls horizontally; drag auto-scroll near edges);
- task drawer: right-hand panel, 400–440px wide, 1px left hairline, slides in over 250ms and never pushes the board;
- command palette: centered overlay near the top (~20vh from the top edge), maximum width ~560px.

### Board freshness

The board is not only mutated from Sisyphus; the user edits the same replica from the Taskwarrior CLI and mobile sync. TanStack Query must therefore refetch the active Board projection:

- on window focus and network reconnect;
- on a modest polling interval while visible (30–60s), disabled when the tab is hidden;
- after every successful mutation (the mutation response already carries the updated task; the projection refetch reconciles ordering and column membership).

The Board projection's generation metadata lets the client discard stale responses that arrive out of order. Real-time push (SSE/WebSocket) is explicitly deferred; polling is acceptable for a single user.

### State ownership

TanStack Query owns server state:

- Board projections;
- task detail;
- sync state;
- mutation status;
- invalidation and refetch.

Local React state owns:

- focused card;
- active mobile column;
- open drawer/sheet;
- temporary drag state;
- current search input;
- unsaved form draft;
- command palette state;
- selection state for bulk operations.

Browser storage owns only device preferences such as:

- last Board;
- active mobile column per Board;
- collapsed desktop columns;
- density preference if introduced;
- dismissed help hints.

### Rendering model

Use components organized by product behavior, not generic atomic-design layers:

```text
BoardPage
BoardHeader
BoardSwitcher
BoardColumn
TaskCard
TaskCardActions
TaskDrawer
TaskForm
DependencyPicker
MoveTaskSheet
CommandPalette
KeyboardHelp
SyncIndicator
OfflineBanner
```

Do not add a global client state library unless actual cross-cutting state becomes difficult with React state and TanStack Query.

### Drag and drop

Desktop behavior:

- pointer drag uses whole-card activation with a `PointerSensor` distance constraint of 6–8px so plain clicks never start a drag; no separate drag handle is needed on desktop;
- keyboard movement is available without entering drag mode;
- Space may enter accessible reorder mode;
- drop targets and live-region announcements are explicit;
- optimistic visual movement is rolled back on failure — never silently: the card animates back and an error toast with Retry appears;
- dragging to a read-only column is impossible and explained: read-only columns dim slightly and show a small lock badge in their header for the duration of the drag, and the drop cursor indicates rejection.

dnd-kit implementation decisions (from dnd-kit's own guidance for kanban):

- one `DndContext` per board, one `SortableContext` per column with `verticalListSortingStrategy`;
- collision detection is `pointerWithin` falling back to `closestCorners` (never `closestCenter`, which resolves to the column instead of the insertion point in stacked layouts, and `closestCorners` alone mishandles empty columns);
- the card is a purely presentational component rendered both inside the sortable wrapper and inside `DragOverlay`; the `useSortable`-calling component is never rendered in the overlay;
- `DragOverlay` stays mounted with children toggled; drop animation 250ms `ease`, set to `null` under reduced motion;
- default auto-scroll (threshold 0.2, both axes) covers vertical column scroll and horizontal board scroll;
- during drag, the source card stays in place at 40% opacity while siblings animate apart to open a real gap (gap insertion, not a line indicator — it matches dnd-kit's sortable model and reads more physically);
- the drag overlay card scales to 1.03 with the app's only permitted floating shadow; no rotation tilt (a Trello-style tilt fights the flat Nocturne Rose direction);
- after any drop or keyboard move, the landed card plays a ~700ms background flash in `--accent-subtle` so the eye can find where the card went — this matters most for keyboard moves and cross-column drops.

Mobile:

- movement uses a `Move to...` bottom sheet as the primary path;
- long-press drag may be added only after physical-device testing proves scrolling remains reliable;
- the full card must not use `touch-action: none`;
- all touch targets meet at least 44 by 44 CSS pixels (48px preferred for primary controls, with at least 8px between adjacent targets).

### Keyboard contract

The initial desktop contract is:

| Key | Action |
|---|---|
| `G` | Focus first visible card |
| `J` / Down | Next card in column |
| `K` / Up | Previous card in column |
| `H` / Left | Nearest card in previous column |
| `L` / Right | Nearest card in next column |
| `Shift+H` / `Shift+Left` | Move to previous writable column |
| `Shift+L` / `Shift+Right` | Move to next writable column |
| `Enter` | Open task details |
| `E` | Edit focused task |
| `N` | Create task in current Board context |
| `/` | Focus search |
| `B` | Open Board switcher |
| `M` | Open Move to column command |
| `Space` | Enter or confirm reorder mode |
| `X` | Toggle selection of the focused card (bulk operations) |
| `C` | Complete focused or selected tasks |
| `Cmd/Ctrl+K` | Open command palette |
| `Cmd/Ctrl+Z` / `U` | Undo the last mutation |
| `Escape` | Cancel mode, clear selection, or close topmost overlay |
| `?` | Open shortcut help |

Number-key direct movement should be considered only when a Board has a small stable number of columns. The command palette is the general solution for arbitrary Boards.

Shortcuts must be disabled while typing in form controls except for safe escape behavior.

### Undo contract

Single-key mutation shortcuts make accidental mutations one keystroke away (`Shift+L` moves a task instantly). Optimistic rollback on server failure is not enough; the product needs user-facing undo:

- every successful mutation triggered from the board (move, complete, start/stop, reorder, delete) shows a toast with an Undo action for 5–6 seconds, pausing its timer on hover or focus;
- `Cmd/Ctrl+Z` undoes the most recent mutation independently of whether its toast is still visible, from a session-local stack of bounded depth (about 20 entries); redo is out of scope for the first release;
- undo is implemented client-side as the inverse mutation (a move back, a reopen, a rank restore) sent through the normal API with the normal `expected_modified` check — there is no server-side undo log;
- if the inverse mutation conflicts because the task changed in the meantime, undo fails into the standard conflict presentation rather than guessing;
- prompted writes (Upcoming, Waiting) restore the previous field value on undo, including "unset".

Text inputs keep native undo while focused; the global stack only covers task mutations.

### Command palette

The palette (`Cmd/Ctrl+K`) is the general mechanism for arbitrary boards and the primary way shortcuts are taught:

- context-aware: actions apply to the focused or selected cards ("Move to Waiting", "Set due date...", "Open in board...");
- fuzzy, case-insensitive matching with synonym aliases (typing "finish" matches "Complete task"), showing the matched alias next to the command name;
- each command renders its single-key shortcut on the right, so the palette doubles as discoverable documentation;
- empty-query state lists contextual actions for the focused card first, then board switching, then global actions;
- opens in well under 100ms with no data fetch on open;
- `?` opens a searchable shortcut help overlay listing the same registry the palette uses — one source of truth for command names, shortcuts, and availability.

### Accessibility

Required behavior:

- one predictable tab stop for the active card region;
- roving focus among cards;
- visible Nocturne Rose focus rings with sufficient contrast;
- semantic headings for Board and columns;
- meaningful card labels containing description and state;
- polite live-region announcements for moves, saves, conflicts, and sync failures;
- every drag operation available through buttons or commands;
- reduced-motion support;
- high-contrast and forced-color behavior;
- focus restoration after closing drawers and dialogs;
- no color-only status communication.

### Feedback, loading, and conflict states

Every state the board can be in must be designed, not improvised:

- **Loading**: a skeleton board mirroring the final layout (column headers plus three or four card-shaped blocks per column) so nothing jumps on arrival. Skeletons appear only after ~300ms — a flash of skeleton for a fast response reads as a glitch. Shimmer is slow and left-to-right, replaced by a static block under reduced motion.
- **Empty column**: the header and drop area persist; the body shows a quiet one-line hint ("No tasks"), and a dashed drop outline appears only while a drag is in progress.
- **Empty board**: one centered block with a single primary action that teaches the shortcut: "Create your first task — press N".
- **Toasts**: bottom-center, `role="status"` with polite live-region semantics, 5–6s for toasts carrying Undo/Retry actions, 2–4s for plain confirmations, manual dismiss always available, and never a required action in an auto-dismissing toast.
- **Conflict (409)**: a non-blocking presentation anchored to the affected card: "This task changed elsewhere", with Reload (accept the server state) and Overwrite (reapply my change against the new `modified`) actions. A field-level compare dialog is deliberately out of scope; single-user conflicts are rare and coarse resolution is acceptable.
- **Sync degradation**: the top-bar sync indicator has four visible states — synced (quiet checkmark), syncing (spinner), degraded (amber warning with a tooltip carrying the last sync error and timestamp), offline (neutral pill, see PWA section). Degraded is informational, not modal; the board keeps working against the local replica as §7 specifies.
- **Failure**: a failed optimistic mutation animates the card back and raises an error toast with Retry. The board never shows state the server has rejected.

### Mobile design

At the mobile breakpoint:

- display one active column at a time, full width (the Trello/Todoist mobile pattern);
- show horizontally scrollable column tabs with names and counts (tabular figures so counts don't shift layout); horizontal swipe between columns pages the board, with the tab strip as the visible, discoverable affordance — swipe alone is not discoverable;
- preserve the selected column per Board;
- render cards as a vertical list;
- use a bottom sheet for task details and editing;
- expose Move to, complete, start/stop, and delete through a reachable action menu;
- keep create, search, and Board switching in a bottom action bar in the thumb zone — roughly 75% of touches are thumb touches and the bottom third of the screen is the only effortless region; the top bar shrinks to Board name and sync state;
- do not require drag-and-drop;
- defer swipe actions on rows (swipe-to-complete/delete) past the first release: they are hidden gestures, easy to trigger accidentally, and every action already has a visible button path. If added later, they follow the platform convention (leading green complete, trailing red delete) and commit with an Undo toast, never a confirmation dialog.

The default active column should be configurable per Board. The lifecycle preset can prefer Doing when non-empty.

Bottom sheet specification:

- two detents — medium (~50% viewport) for the action menu and task summary, large (~90%) for editing — mapped to real content states, not arbitrary heights;
- a 32×4px centered grabber, but dragging is never the only way to resize or dismiss: an explicit close button always exists;
- scrim at 40% black; tap-to-dismiss on the scrim; swipe-down dismisses with velocity-based logic (slow drag past halfway collapses, fast flick dismisses from anywhere);
- sheet enter ~300ms decelerating, exit ~200ms accelerating, crossfade under reduced motion;
- scrollable sheet content hands off correctly: scrolled-to-top plus downward drag moves the sheet, otherwise the content scrolls;
- an editing sheet with an open virtual keyboard is the hardest mobile case: iOS Safari shrinks only the visual viewport, and `dvh`/`svh` units do not react to the keyboard. The sheet's action row is positioned using the `visualViewport` API (resize events mirrored into a CSS custom property), and the focused input is scrolled into view manually because iOS auto-scroll inside fixed-position sheets is unreliable;
- unsaved edits in a dismissed sheet trigger the standard dirty-state protection, not silent loss.

Viewport and layout plumbing that must be correct from the start:

- the app shell uses `100dvh` with a `100vh` fallback declaration order, never bare `100vh`;
- `viewport-fit=cover` plus `env(safe-area-inset-bottom)` padding on the bottom action bar and sheets for the home-indicator area;
- lists keep enough bottom padding that the last card clears the bottom bar.

### Task editor

The primary editor exposes:

- description;
- project;
- tags;
- priority;
- due;
- wait;
- scheduled;
- dependencies;
- append-only annotations;
- lifecycle actions.

A raw details section displays:

- UUID;
- status;
- urgency;
- entry, modified, start, and end timestamps;
- recurrence and parent metadata;
- unknown UDAs and other unrecognized exported fields.

Unknown fields are read-only in the first release. Arbitrary typed UDA editing is deferred.

### Offline PWA

Cache:

- application shell;
- static assets;
- Nocturne Rose theme assets;
- last successful Board projection per recently viewed Board.

Offline behavior:

- clearly mark cached data and its generation time;
- allow navigation among cached Boards if available;
- disable mutation controls with an explanation;
- preserve unsaved form drafts locally until connectivity returns or the user discards them;
- never present a queued mutation as saved.

Do not cache authentication responses or secrets.

Installed-app details:

- `display: standalone` in the manifest (iOS treats `fullscreen` and `minimal-ui` as fallbacks anyway); detect `display-mode: standalone` to hide any install hint;
- `<meta name="theme-color">` set to the canvas color and `color-scheme: dark` declared in both meta and CSS so the iOS status bar, native form controls, and scrollbars match the theme;
- a proper `apple-touch-icon`; iOS ignores manifest splash screens and per-device `apple-touch-startup-image` sets are not worth maintaining — no splash on iOS is accepted;
- iOS reality check for scope decisions: there is no background sync on iOS, and WebKit may evict site storage after extended non-use. The offline cache is a convenience layer over the server as source of truth, never a durable store — which the read-only offline decision already respects;
- offline presentation follows offline-UX conventions: a persistent, non-blocking pill or banner ("Offline — showing data from 14:32"), not an error state, with the staleness timestamp shown only when stale or offline rather than permanently.

## 10. Nocturne Rose Visual System

### Look and feel in one paragraph

Sisyphus should feel like a quiet instrument: a near-black board where almost everything is a neutral surface separated by hairlines, type does the organizing, and color appears only where it means something — rose for focus, selection, and the primary action; amber and red for time pressure; nothing else shouting. The reference for the overall feel is Linear's board in a Nocturne Rose skin: dense, flat, hairline-bordered, keyboard-taught, with motion that is brief and physical. It should not feel like Trello: no tilted drag cards, no saturated column colors, no playful chrome.

### Elevation model

Dark UIs cannot use shadows for hierarchy (they vanish on dark ground), so elevation is expressed the way Material's dark theme and Linear/GitHub/Vercel dark do it: **each layer is a slightly lighter surface with a 1px hairline border**. The palette already provides the ladder:

| Layer | Token | Value | Used for |
|---|---|---|---|
| 0 | `--canvas` | `#0d0d10` | board background |
| 1 | `--shell` | `#121217` | top bar, column bodies, drawers |
| 2 | `--surface-card` | `#18181f` | cards, inputs |
| 3 | `--surface-raised` | `#22222c` | hover states, menus, sheets, palette, toasts |
| 4 | `--surface-active` | `#30303d` | pressed states, drag-over emphasis |

Exactly one shadow token exists — `--shadow-overlay` (something like `0 8px 24px rgb(0 0 0 / 0.5)`) — and only floating layers use it: menus, command palette, drag overlay, toasts, bottom sheets. Cards at rest never have shadows.

### Semantic tokens

Create a source file such as `frontend/src/theme/nocturne-rose.css`:

```css
:root {
  color-scheme: dark;

  /* Surfaces — elevation is a lighter surface plus a hairline, never a shadow */
  --canvas: #0d0d10;
  --shell: #121217;
  --surface-card: #18181f;
  --surface-raised: #22222c;
  --surface-active: #30303d;

  /* Hairlines */
  --border-subtle: #22222c;
  --border-strong: #30303d;

  /* Text */
  --text-primary: #ebe7ed;
  --text-secondary: #aaa5b0;
  --text-muted: #77727f;     /* large text and glyphs only — see contrast rules */
  --text-disabled: #504c57;  /* disabled controls only, never content */

  /* Accent — Rose */
  --accent: #d48aa4;
  --accent-strong: #e3a0b8;
  --accent-subtle: #7c4659;  /* backgrounds and borders only, never text */
  --accent-tint: color-mix(in srgb, #d48aa4 12%, #18181f);
  --on-accent: #09090b;      /* text on any accent or status fill */
  --focus-ring: #d48aa4;

  /* Status */
  --status-info: #88a8bd;
  --status-success: #8aa47f;
  --status-warning: #d3b069;
  --status-danger: #cc655c;
  --status-info-tint: color-mix(in srgb, #88a8bd 12%, #18181f);
  --status-success-tint: color-mix(in srgb, #8aa47f 12%, #18181f);
  --status-warning-tint: color-mix(in srgb, #d3b069 12%, #18181f);
  --status-danger-tint: color-mix(in srgb, #cc655c 12%, #18181f);

  /* Due-state semantics (the board's main use of color) */
  --due-overdue: var(--status-danger);
  --due-today: var(--status-warning);
  --due-upcoming: var(--text-secondary);

  /* Motion */
  --motion-fast: 120ms;      /* hover, press */
  --motion-base: 200ms;      /* reorder shifts, toasts, exits */
  --motion-overlay: 250ms;   /* drawer, drop animation */
  --ease-out: cubic-bezier(0.32, 0.72, 0, 1);
  --ease-spring: cubic-bezier(0.15, 1, 0.3, 1);
}
```

Secondary palette colors (orchid, blue, aqua, green, yellow) are reserved for tag/project identity coloring if that is ever introduced; the first release uses them only through the status tokens above.

### Contrast audit and hard usage rules

WCAG ratios were computed for the vendored palette (AA requires 4.5:1 for normal text, 3:1 for large text and UI components):

| Foreground | on `--surface-card` | on `--surface-active` | Verdict |
|---|---|---|---|
| `--text-primary` | 14.5 | 10.6 | any size, anywhere |
| `--text-secondary` | 7.3 | 5.4 | any size, anywhere |
| `--text-muted` | 3.8 | 2.8 | large text/glyphs only; **fails everything on `--surface-active`** |
| `--text-disabled` | 2.1 | 1.6 | decorative/disabled only |
| `--accent` (rose) | 6.7 | 4.9 | any size, anywhere; focus ring passes 3:1 on every surface |
| `--accent-subtle` | 2.4 | 1.8 | **never as text** — fills and borders only |
| `--status-danger` | 4.7 | 3.5 | small text OK on canvas/shell/card; **large-only on raised surfaces** |
| `--status-warning` | 8.6 | 6.3 | any size |
| `--status-success` | 6.5 | 4.8 | any size |
| `--status-info` | 7.1 | 5.2 | any size |
| `--on-accent` on rose fill | 7.4 | — | primary buttons pass comfortably |

The rules that follow, enforced in review:

- card metadata and all small essential text use `--text-secondary`, never `--text-muted`;
- `--text-muted` is limited to text at 24px+/19px-bold+ and non-essential glyphs, and never appears on `--surface-active`;
- `--accent-subtle` and `--text-disabled` never carry information as foregrounds;
- danger-colored small text appears only on layers 0–2; on menus, sheets, and toasts, danger pairs an icon with `--text-primary` text or uses the tint-background chip pattern;
- filled controls (primary button, selected chip) always use `--on-accent` near-black text on the fill — never white on rose;
- status is never color-only: every colored chip carries an icon or label.

### Typography

- Font: the system UI stack (`system-ui, -apple-system, "Segoe UI", sans-serif`) — zero font loading cost for the PWA. Vendoring Inter later is an intentional change, not a default.
- Scale: 12 / 13 / 14 / 16 / 18 / 20px. Board body is 13px, forms and drawer body 14px, metadata floor 12px. Nothing smaller than 12px anywhere.
- Line height ~1.4 on the board, ~1.5 in forms and details.
- Weights 400/500/600 only. No 300 — light text blooms on dark ground.
- `font-variant-numeric: tabular-nums` on all counts, dates, and column headers so numbers don't shift layout when they tick.
- Monospace (`ui-monospace, "SF Mono", monospace`) selectively: UUIDs, shortcut hints in the palette and help overlay, and the raw-details section. Never for body text.

### Layout metrics

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32px.
- Radii: 6px controls and chips-in-forms, 8px cards, 12px panels/sheets/palette, pill for metadata chips.
- Columns: 300px fixed width, 12px gap, 12px board padding; the board scrolls horizontally, columns never shrink.
- Cards: 10px vertical / 12px horizontal padding, 8px between cards.
- Top bar 48px; task drawer 400–440px; desktop pointer targets ≥32px, mobile ≥44px.
- Scrollbars: thin overlay style, `--surface-active` thumb on a transparent track.

### Component specifications

**Card anatomy.** The card is a handle, not a document — the description body never renders on a card (the drawer owns it):

```text
┌────────────────────────────────────┐
│ Title, 13px/500, max two lines     │
│ ▮ 12 Sep · home.garden · #errand ⛓2│
└────────────────────────────────────┘
```

- Row two is a 12px chip row in `--text-secondary`: priority glyph (colored bar-chart-style icon, filled amber/red for high/urgent), due chip (icon plus short date, colored by `--due-*` state), project path, first tag, and a blocked chip.
- The blocked chip (`⛓` or lock icon plus count of open blockers, in `--status-danger` on `--status-danger-tint`) is the loudest element after the title.
- Card states: rest = `--surface-card` + `--border-subtle`; hover = `--surface-raised` + `--border-strong` over `--motion-fast`; keyboard focus = 2px `--focus-ring` outline with 2px offset (meets WCAG 2.2 focus-appearance guidance); selected (bulk) = `--accent-tint` background with a 2px `--accent-subtle` left bar — selection and focus are visually distinct and can coexist; drag source = 40% opacity in place; landed = 700ms `--accent-subtle` background flash.

**Column.** `--shell` body, 12px radius. Sticky header: name at 13px/600, count in a tabular-nums pill, then WIP as `count / limit` tinted `--status-warning` when exceeded (display-only, as decided), a `+` create affordance, and an overflow menu with collapse. Collapsed column = ~40px vertical strip with rotated name and count, still a valid drop target. Read-only columns show a small muted lock glyph in the header at all times and dim during drags.

**Buttons.** Primary = `--accent` fill, `--on-accent` text, hover `--accent-strong`. Secondary = `--surface-raised` + `--border-strong` + `--text-primary`. Destructive actions are secondary buttons with danger icon + text, confirmed only for deletion.

**Chips.** Pill radius, `--surface-raised` background, 2×8px padding, 12px `--text-secondary`; status variants use the matching `-tint` background with the status color on icon and text (subject to the danger rule above).

**Overlays.** Menus, command palette, and toasts sit on `--surface-raised` with `--border-strong` and `--shadow-overlay`. The drawer sits on `--shell` with a hairline, no shadow (it is docked, not floating).

### Motion

- Hover/press feedback: 120ms. Reorder shifts: 200ms ease. Drop animation: 250ms. Drawer: 250ms in / 200ms out with `--ease-out`. Bottom sheet: 300ms in / 200ms out. Toast: 200ms slide-up. Landed-card flash: 700ms fade.
- Nothing functional exceeds 400ms; enter is always slightly longer than exit.
- Under `prefers-reduced-motion: reduce`: drawer/sheet slides and card fly-ins become ≤200ms crossfades, the dnd-kit drop animation is disabled, shimmer becomes a static block, and the landed flash remains (it is a fade, and it carries information). Color transitions and focus-ring changes are kept.

### Design direction summary

- Dense but not cramped; type and hairlines do the organizing.
- Flat application chrome; elevation only through the surface ladder.
- Rose reserved for focus, selection, and primary action; due-state amber/red is the board's dominant use of color; semantic colors only for actual state.
- No gradients, glass, or tilted drag previews; one shadow token, floating layers only.
- Cards prioritize title, due state, blockers, project, and one or two configured fields; everything else lives in the drawer.

### Palette provenance

Vendor the generated Sisyphus package from the canonical `mbastakis/nocturne-rose` repository. Updating the committed package remains an intentional project change, not an automatic runtime dependency.

One intentional extension is on the table: a brightened danger variant (a salmon-shifted red) for small danger text on raised surfaces, because the vendored red sits below 4.5:1 there. Decide during Phase 4 whether to add it to the canonical palette or live with the icon-plus-neutral-text rule.

## 11. Security and Deployment

### Authentication

Preserve both supported deployment modes:

- internal Basic Auth for simple private deployment;
- trusted reverse-proxy authentication when explicitly enabled.

Default to authenticated operation. No-auth mode must require an explicit environment flag.

### API security

- same-origin frontend and API;
- no permissive CORS by default;
- bounded request bodies;
- no shell invocation;
- strict UUID validation;
- strict Board/column ID validation;
- server-side enforcement of all allowed actions;
- sanitized browser errors;
- secrets excluded from health/system responses and logs;
- CSRF posture documented for Basic Auth and reverse-proxy deployments.

If cookie-based proxy authentication is used, evaluate Origin/Referer validation or CSRF tokens for mutation requests rather than assuming private deployment is sufficient.

### Container

Use a multi-stage build:

1. Node stage builds the React application.
2. Python/Taskwarrior stage installs the backend and pinned Taskwarrior.
3. Runtime image contains only built assets, Python runtime, backend package, Taskwarrior runtime, and entrypoint.

Keep durable paths:

- `/config` for generated Taskwarrior configuration and Sisyphus Board YAML;
- `/data` for the Taskwarrior/TaskChampion replica.

Align the declared Python version with the actual runtime image. The current repository declares Python 3.13 while the Ubuntu runtime likely provides Python 3.12; the rewrite must remove this mismatch.

Correct and document one canonical TaskChampion encryption-secret environment name. The current README and entrypoint disagree.

## 12. Testing Strategy

### Backend unit tests

Test without Taskwarrior subprocesses:

- YAML parsing and schema validation;
- Board ID and rank UDA rules;
- lifecycle matching precedence;
- exact project Board generation and scoping;
- daily computed columns;
- read-only versus writable moves;
- mutation-plan generation;
- dependency classification and cycles;
- optimistic concurrency;
- rank insertion and rebalance;
- allowed-action projection;
- sync-state semantics;
- error sanitization.

### Taskwarrior adapter integration tests

Run against an isolated temporary Taskwarrior database using the pinned Taskwarrior version:

- export parsing;
- create and stable UUID lookup;
- update every curated field;
- start, stop, complete, reopen, delete;
- annotation append;
- dependency add/remove;
- rank UDA writes;
- stale timestamp conflict;
- hook behavior where practical;
- command timeout behavior;
- malformed or noisy CLI output;
- partial multi-command failure behavior.

### API contract tests

Use FastAPI test clients to verify:

- OpenAPI stability;
- route status and error envelopes;
- projected Board DTOs;
- per-column allowed actions;
- conflict responses;
- authentication modes;
- request size limits;
- sync degradation responses.

### Frontend component tests

Test:

- Board and card rendering from DTOs;
- keyboard navigation;
- shortcut suppression inside inputs;
- move command availability;
- optimistic movement and rollback;
- conflict presentation;
- task form dirty-state protection;
- offline disabling and cached timestamps;
- mobile column switching;
- focus restoration;
- command palette behavior.

### End-to-end browser tests

Playwright should cover desktop and mobile viewport contracts:

- load and switch Boards;
- lifecycle movement by pointer and keyboard;
- project-scoped Board behavior;
- Daily Board write/read-only behavior;
- manual reorder persistence;
- create/edit/delete lifecycle;
- dependency navigation;
- stale conflict resolution;
- sync failure recovery;
- auth proxy reauthentication if retained;
- PWA offline read-only behavior;
- Nocturne Rose visual tokens;
- reduced motion;
- forced colors;
- browser zoom/reflow;
- single-column mobile interaction.

Add automated accessibility checks, but retain manual VoiceOver and physical-device test checklists.

### Physical device validation

Before calling mobile complete, test at minimum:

- iPhone Safari;
- Android Chrome;
- touch scrolling inside long columns;
- bottom-sheet editing with virtual keyboard;
- Board and column switching;
- accidental drag prevention;
- safe-area insets;
- offline cached Board display;
- authentication expiry recovery.

## 13. Delivery Phases

The user selected a full rewrite on the main branch with deletion of the old implementation rather than an incremental side-by-side migration. The implementation should still proceed in vertical phases so the repository returns to a deployable state quickly.

### Phase 0: Preserve the behavioral contract

Before deleting code:

- retain fixtures that describe representative Taskwarrior exports;
- retain or rewrite integration scenarios for create, edit, conflict, dependency, move, bulk, delete, and sync degradation;
- capture current environment and deployment behavior;
- identify any infrastructure repository expectations for image paths, health checks, port, auth, and environment variables;
- decide which current behavior is intentionally removed.

Deliverables:

- accepted architecture plan;
- ADRs;
- canonical environment-variable table;
- representative task fixtures;
- rewrite issue/task breakdown.

### Phase 1: New repository skeleton

- remove the old flat application after preserving required fixtures and contracts;
- create `backend/` and `frontend/` packages;
- configure mise, uv, Node, linting, formatting, tests, and Taskfile tasks;
- establish a single `validate` task;
- add Docker multi-stage skeleton;
- add Nocturne Rose semantic token snapshot;
- add example Board YAML and schema validation command.

Exit criteria:

- backend health route runs;
- frontend shell builds and renders;
- Docker image builds;
- validation runs from a clean checkout.

### Phase 2: Taskwarrior repository and core API

- implement subprocess runner with timeout and controlled environment;
- implement Taskwarrior export/query/get/create/update/delete;
- implement sync state;
- implement Task normalization and raw-field preservation;
- implement optimistic concurrency;
- expose health, system, sync, and task-detail routes;
- add isolated Taskwarrior integration tests.

Exit criteria:

- API can round-trip curated Task fields against real Taskwarrior;
- conflicts are deterministic;
- sync failure is accurately represented;
- no route invokes subprocesses directly.

### Phase 3: Board configuration and projection

- implement YAML models and strict validation;
- implement Board Scope evaluation;
- implement lifecycle preset;
- implement project lifecycle preset;
- implement daily preset;
- implement match/write separation;
- implement allowed actions;
- implement dependency enrichment;
- expose Board list and projection routes.

Exit criteria:

- the three selected Board presets are fully represented through projected DTOs;
- overlapping Boards show the same UUID-backed Task without duplication of canonical state;
- ambiguous/read-only moves are rejected server-side.

### Phase 4: React Kanban core

- implement application shell and Board switcher;
- consume generated API types;
- render desktop columns and cards;
- implement task detail drawer;
- implement curated editor and raw details;
- implement search and Board-local filtering;
- implement sync/offline/conflict status;
- apply Nocturne Rose visual system.

Exit criteria:

- all three Board presets are usable without drag-and-drop;
- create, edit, lifecycle actions, and dependency inspection work;
- desktop keyboard focus is stable.

### Phase 5: Movement and ordering

- implement command-based movement;
- implement dnd-kit pointer movement;
- implement accessible reorder mode;
- implement per-Board sparse ranks;
- implement optimistic movement and rollback;
- implement date prompt for Upcoming;
- implement bulk movement if still required after usability testing.

Exit criteria:

- manual order persists across refresh and devices;
- movement is possible by keyboard, pointer, and menu;
- read-only columns cannot receive a move;
- rank rebalance is covered by tests.

### Phase 6: Mobile and PWA

- implement single-column mobile layout;
- implement column tabs and counts;
- implement bottom sheets;
- implement Move to sheet;
- add manifest and service worker;
- cache last Board projections for read-only offline use;
- add offline banners and disabled mutation states;
- perform physical-device testing.

Exit criteria:

- core task operations are usable on mobile without drag;
- cached Boards are inspectable offline;
- no mutation is falsely presented as saved offline;
- touch scrolling remains reliable.

### Phase 7: Hardening and deployment

- finalize authentication and CSRF posture;
- add structured logs and request IDs;
- sanitize errors;
- finish live deployment contract tests;
- verify TaskChampion sync against the home server;
- document backup and restore of `/config` and `/data`;
- update consuming infrastructure;
- remove all stale old-application documentation and environment names.

Exit criteria:

- production image is deployed behind the existing proxy/auth setup;
- real TaskChampion sync is tested;
- rollback procedure is documented;
- old routes and files are absent unless explicitly retained as compatibility contracts.

## 14. Suggested Taskfile Commands

Use go-task through mise as required by the workstation conventions.

```text
task format
task lint
task test:backend
task test:integration
task test:frontend
task test:e2e
task test:a11y
task generate:api
task config:validate
task build:frontend
task build:image
task validate
```

Invoke as:

```bash
mise exec task -- task validate
```

## 15. Explicit Non-Goals

The first release will not include:

- multi-user collaboration;
- assignments, permissions, or shared workspaces;
- comments as a collaborative activity stream;
- a universal task-backend protocol;
- compatibility with Vikunja, Planka, Plane, or another product API;
- multiple production repository adapters;
- direct TaskChampion integration;
- browser-side offline mutations;
- an in-app Board configuration editor;
- arbitrary editable UDAs;
- projects-as-columns;
- Gantt, calendar, timeline, analytics, or reporting suites;
- native desktop or mobile applications;
- horizontal backend scaling over one Taskwarrior replica;
- exact emulation of another open-source frontend.

## 16. Risks and Mitigations

### Taskwarrior CLI is a textual integration boundary

Risk: output changes, locale, hooks, or version differences break parsing.

Mitigation: pin Taskwarrior, control locale/config overrides, isolate parsing, add real-version integration tests, and keep human-output parsing to a minimum.

### Configurable mappings can become a programming language

Risk: arbitrary match and mutation expressions become hard to validate and unsafe to evolve.

Mitigation: begin with presets and a small declarative rule vocabulary. Allow raw Taskwarrior filters for scope/match only where necessary. Keep write rules strongly typed and finite.

### Overlapping Boards multiply metadata

Risk: per-Board rank UDAs accumulate on Tasks and stale Board definitions leave unused metadata.

Mitigation: create rank fields only for manual Boards, use stable IDs, document cleanup tooling, and show rank UDAs in raw details.

### Full rewrite can lose mature behavior

Risk: the existing application already contains nuanced conflict, dependency, authentication, keyboard, and mobile behavior.

Mitigation: preserve behavioral fixtures and scenario tests before deletion, then restore features by vertical slice rather than by visual component count.

### Mobile drag can damage scrolling

Risk: card drag gestures conflict with vertical and horizontal touch navigation.

Mitigation: do not make drag necessary on mobile; use Move to sheets and physical-device testing. Avoid disabling touch actions on whole cards.

### Single-key shortcuts make accidental mutations cheap

Risk: `Shift+L` or a mistyped palette command mutates Taskwarrior instantly; without recovery, keyboard speed becomes keyboard danger.

Mitigation: the undo contract in section 9 — every board mutation gets an undo toast and `Cmd/Ctrl+Z`, implemented as inverse mutations through the normal concurrency-checked API. Destructive delete keeps a confirmation; everything else is undoable rather than confirmed.

### Server and browser disagree about "today"

Risk: date-relative filters are evaluated in the server timezone; a UTC container makes the Daily board wrong around midnight and writes the wrong due dates.

Mitigation: the timezone policy in section 7 — mandatory explicit `TZ`, timezone exposed via `/api/v1/system`, and a frontend warning when browser and server timezones differ.

### Offline cache can appear authoritative

Risk: users mistake stale cached Boards for current synchronized state.

Mitigation: display generation time and offline status prominently, disable mutations, and never update cached projections optimistically without a confirmed server response.

### Generic repository abstraction becomes speculative

Risk: design effort is spent supporting hypothetical backends and weakens Taskwarrior behavior.

Mitigation: maintain one production CLI adapter. Evolve the port only from demonstrated Sisyphus use cases.

### FastAPI dependency growth undermines simplicity

Risk: the backend becomes framework-heavy compared with the current standard-library server.

Mitigation: keep route handlers thin, avoid ORM/database dependencies, avoid unnecessary middleware, and retain Taskwarrior as the only task persistence system.

## 17. Open Implementation Questions

These do not block the architecture but must be resolved during the relevant phase:

1. Confirm valid Taskwarrior UDA naming and length constraints for per-Board ranks.
2. Select the sparse rank representation and rebalance threshold.
3. Define the exact small declarative vocabulary for `match` and `write` rules.
4. Decide whether Board scopes accept raw Taskwarrior filters directly or a validated subset plus an escape hatch.
5. Define the fallback for tasks that match multiple or zero columns.
6. Decide whether completed-task retention is global or configurable per Board.
7. Decide whether annotations remain append-only or gain edit/delete operations.
8. Decide whether bulk editing survives the rewrite based on actual use rather than parity alone.
9. Confirm reverse-proxy authentication behavior and CSRF requirements in the production infrastructure.
10. Confirm whether the frontend is served by FastAPI or by a separate static server in production. One container remains acceptable either way.
11. Establish expected maximum pending-task count to decide when virtualization or incremental Board loading becomes necessary.
12. Define a safe migration/cleanup command if a Board ID or rank UDA must ever be retired.
13. Decide whether to add a brightened danger color variant to the canonical palette for small danger text on raised surfaces, or keep the icon-plus-neutral-text rule (section 10 contrast audit).
14. Confirm the undo stack depth and which mutations are excluded from undo (candidate exclusion: annotation append, which is append-only by design).
15. Choose the configurable `ready` tag name convention for the lifecycle preset and how it interacts with users who already tag with `+next`.
16. Pick the Board projection polling interval and confirm it is cheap enough against `task export` latency on the real task count.

## 18. Definition of Success

The rewrite is successful when:

- Taskwarrior remains unquestionably canonical;
- the same Task can appear coherently on multiple overlapping Boards;
- lifecycle, project lifecycle, and daily Boards are configurable through YAML;
- desktop use is fast without a mouse;
- mobile use is comfortable without drag-and-drop;
- manual order persists independently per Board;
- conflicts and sync degradation are accurate and visible;
- the browser can inspect cached Boards offline without creating a second mutation replica;
- Nocturne Rose feels native rather than applied as a superficial recolor;
- the frontend can be replaced through the Sisyphus API without changing Taskwarrior integration;
- the Taskwarrior CLI adapter can be tested independently without weakening the API into a generic backend abstraction;
- the application remains a focused personal Kanban product rather than expanding into a team project-management suite.

## 19. Design-Review Findings (2026-09-01)

Issues caught while writing the UI/UX specification, and where they are now addressed:

1. **Palette contrast failures.** A computed WCAG audit showed `--text-muted` fails 4.5:1 on every surface (large-text only, and fails even 3:1 on `--surface-active`), `--text-disabled` and `--accent-subtle` fail 3:1 as foregrounds everywhere, and `--status-danger` drops below 4.5:1 on raised surfaces. Fixed with hard usage rules and the audit table in section 10.
2. **No undo story.** The plan had optimistic rollback on server failure but no user-facing undo, while single keystrokes mutate Taskwarrior. Fixed with the undo contract in section 9 and a new risk in section 16.
3. **Timezone hazard.** `due:today` is evaluated in the server timezone; a UTC container silently breaks the Daily board. Fixed with the timezone policy in section 7.
4. **Rank UDAs were validated but never declared.** Undeclared UDAs surprise Taskwarrior and other clients sharing the replica. Fixed in section 6 configuration constraints.
5. **Lifecycle preset semantics were undefined.** "preset: waiting" had no defined match or write behavior; Waiting requires a date prompt (so the prompt mechanism is not Daily-board-only), leaving Doing must stop the task, and leaving Done is a reopen. Fixed with the preset semantics table in section 6.
6. **No board freshness policy.** Nothing said how the UI learns about CLI edits while a board is open. Fixed with the refetch policy in section 9.
7. **Unspecified feedback states.** Loading, empty, conflict, and toast behavior were unmentioned and would have been improvised during implementation. Fixed with the feedback-states section in section 9.
8. **iOS PWA realities.** No background sync, possible storage eviction, ignored manifest splash screens, and virtual-keyboard/viewport quirks (`dvh` does not react to the keyboard; `visualViewport` is required) now appear in sections 9's mobile and PWA subsections so they are planned for rather than discovered on device.
