# Task API contract (ADRs 0005–0010)

All routes retain the existing `/api/v1` prefix. Existing task fields and response envelopes remain. Dates use the server `TZ`; planning, follow-up and deferral dates write local midnight, while date-only deadlines write end-of-day. Native `scheduled` is not used for planning.

## Read models

Every Card (including task detail and mutation responses) adds:

- `lifecycle`: `backlog|ready|doing|waiting|done|deleted|recurring` (deferral is orthogonal).
- `committed`, `deferred`: booleans. Commitment is `+next` (started work also counts as committed).
- `planned_for`, `follow_up_on`: `YYYY-MM-DD|null`.
- `deferred_until`: ISO datetime or null; `blocker`: string or null.
- `open_dependencies`: `{uuid,description}[]`, resolved against the entire universe; missing references conservatively remain open with description `Unknown task`.
- `attention_reasons`: array of `overdue|due_today|follow_up|unfinished_plan|blocked_plan`.
- `allowed_actions`: string array drawn from `start|stop|complete|reopen|plan_today|clear_plan|block|clear_blocker|follow_up|defer|return_now|ready|backlog|up_next|ready_pool`.

`GET /api/v1/boards` summaries retain existing fields and add `group` (`active|later|history|null`), `committed_count`, `unfinished_count`, `backlog_count`, `deferred_count`, `next_deferred_until`, and `last_completed_at`. Core boards have null group. History includes all completion ages; deleted-only projects are omitted; recurring-template-only projects are Later.

`GET /api/v1/boards/{board_id}` retains `columns` and adds `view: kanban|today`, `deferred: Card[]`, and `today: {attention,doing,chosen,unfinished_plans,ready_pool,done_today}` (each value is `Card[]`). Today retains stable board ID `daily`, name Today, and has empty columns. Other boards return empty Today sections. Future native wait excludes tasks from ordinary sections and columns. Today sections are disjoint: ongoing Doing takes precedence, then Chosen, then attention, then unfinished plans, then Ready pool; reasons remain on cards wherever shown. Due tasks deliberately chosen today remain in Chosen. Done today is server-local completion date. Attention includes overdue/today deadlines, arrived follow-ups and blocked plans; old unstarted plans appear in unfinished plans unless attention takes precedence.

`GET /api/v1/boards/{board_id}?history=true` returns `view: kanban`, all configured lifecycle columns (Today uses standard lifecycle columns), with only completed tasks in Done, newest completion first, without retention limits. Today sections and deferred are empty. Scope still respects the board's exact project.

## Actions

`POST /api/v1/tasks/{uuid}/action` body: `{action,expected_modified,date?,blocker?}`; response `{task: Card}`. `date` is `YYYY-MM-DD`. Supported semantic actions: `plan_today`, `clear_plan`, `block`, `clear_blocker`, `follow_up`, `defer`, `return_now`; lifecycle actions `start`, `stop`, `complete`, `reopen`, `ready`, `backlog` also accepted. Existing `/start`, `/stop`, `/complete`, `/reopen` routes share this policy. Invalid actions return 422; stale modifications return 409.

Planning today commits an unblocked task, never starts it or changes due. Starting commits and requires no open blocker/dependency or future deferral. Blocking requires nonblank `blocker`, stops work, preserves commitment, and optionally accepts a follow-up `date`. Clearing a blocker clears only its text and follow-up, never dependencies, and never starts execution. Follow-up requires an explicit blocker or open dependency and a date (null clears follow-up). Deferring requires a future date, stops execution, preserves commitment and blockers, and clears daily intent; return_now clears only wait. Clearing a plan preserves commitment. Waiting moves prompt for blocker text (`field: blocker`, `input: text`), never a wait date. Read-only columns reject creation/moves before persistence.

## Creation and editing

`POST /api/v1/boards/{board_id}/tasks` retains `description,project,priority,due,column_id,prompt_value`, adding optional `planned_for` (date), `blocker` (text), `follow_up_on` (date), `dependencies` (UUID array), `annotations` (text array). Default is Backlog. Explicit `ready`/`doing` column or a planning date expresses commitment. All metadata and target transitions are validated before creation. Dependencies must exist and be unfinished; annotations cannot be blank; priority is H/M/L or null. Today creation never writes due unless explicitly supplied. Generic PATCH supports description/project/priority/due and depends; semantic metadata is changed through actions. Raw wait/scheduled edits are rejected.

## Persistence and rollover

Native fields: `start`, status/completion, `due`, `depends`, annotations; native `wait` exclusively means deferral. UDAs: `sisyphus_plan` date, `sisyphus_blocker` string, `sisyphus_followup` date. No background rollover or guessed migration: dates merely change projection, never clear blockers or rewrite deadlines. Legacy daily config normalizes to Today at load time. Uncommitted blocked tasks remain Backlog; committed blocked tasks are Waiting.

## Review clarifications

- Today drop targets use semantic actions `up_next` and `ready_pool`. Both
  require unblocked, non-deferred unfinished work and preserve commitment.
  `up_next` stops execution and chooses today; `ready_pool` stops execution and
  clears daily selection. Dropping in Doing uses `start`. Each uses one API
  request with one expected-modified check and never writes deadlines.

- Deferred tasks remain excluded from actionable sections and Kanban columns, but real due-today/overdue deadlines still appear in Today attention. These Cards also remain in `deferred`; that cross-list overlap is intentional, and their deferred restrictions and commitment are unchanged. Follow-up and plan attention remain suppressed while deferred.
- Explicit move/create into Waiting commits with `+next` and records the blocker. The factual `block` action preserves existing commitment, so blocking uncommitted work leaves it in Backlog.
- Today creation accepts standard lifecycle `column_id` values despite its empty display columns, including `backlog`, `ready`, and `waiting`. These are validated before persistence; this does not enable legacy deadline-column moves.
- Recurring templates contribute an unfinished/Later signal but never an Active committed count, even when tagged `+next`.
- Invalid external planning/follow-up UDA dates render as null. API writes remain strict; an explicitly empty date is invalid (422), while null clears optional follow-up.
- A creation request combining `planned_for` with an explicit Backlog target is rejected before persistence rather than silently clearing its plan. Unsupported PATCH value types likewise return 422 without partial writes.
- Resolving a blocker preserves inferred commitment even for externally started Tasks missing `+next`: it materializes that commitment before stopping, returning unblocked work to Ready.

## Concurrency limitations

An empty `expected_modified` is rejected with 422. A differing token yields 409 with a fresh universe-resolved Card. Taskwarrior 3.4.2 modification timestamps have second precision, so changes within the same second can share a token and cannot reliably be detected by this existing API token. Check-then-write is not a cross-client transaction. CLI multi-command transitions and annotation creation can partially persist if a later subprocess fails; input/transition validation is completed before the first write, but there is no rollback transaction.
