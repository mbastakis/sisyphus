# Sisyphus

Sisyphus provides visual personal Boards over Tasks whose canonical meaning and lifecycle remain owned by Taskwarrior.

## Language

**Task**:
A unit of work identified by its stable Taskwarrior identity and usable from both Sisyphus and ordinary Taskwarrior clients.
_Avoid_: Card, issue, work item

**Board**:
A named lens over the Task Universe, defined by a Task scope, ordering, and presentation. Lifecycle uses Kanban columns; Today uses a focused work surface (stable Board ID `daily`). Exact Taskwarrior project names generate Project Boards automatically. Boards may overlap and never own a separate copy of Task state.
_Avoid_: Task database, workflow

**System of Record**:
Taskwarrior and its synchronized TaskChampion replica are the canonical source of Task state. Sisyphus-specific concepts must preserve the ability to use and edit the underlying Task through ordinary Taskwarrior clients.
_Avoid_: Sisyphus database, frontend-owned task

**Board Metadata**:
Optional Taskwarrior task data used to preserve a Sisyphus presentation concept that cannot be represented by an existing Taskwarrior field. It remains attached to the Task rather than living in a separate Sisyphus task store.
_Avoid_: Frontend-only task state

**Task Universe**:
The single person's complete set of Tasks available to Sisyphus. It has no Sisyphus-specific ownership, assignment, membership, or permission boundaries.
_Avoid_: Workspace, tenant, team board

**Board Scope**:
The Taskwarrior query or rule that selects which Tasks appear on a Board. Scopes may overlap, allowing the same Task to appear on project, daily, or other purpose-specific Boards.
_Avoid_: Ownership, board membership

**Column Mapping**:
A Board's rule for placing and moving Tasks among columns using Taskwarrior fields, tags, or Board Metadata. Different Boards may use different mappings over overlapping Tasks.
_Avoid_: Workflow, separate status database

**View**:
A presentation mode within a Board, defined by additional filters, sorting, visible fields, or compactness. A View does not change the Board Scope or canonical meaning of a Task.
_Avoid_: Board, project

**Sisyphus API**:
The product-owned interface that presents Taskwarrior-backed Tasks and Board operations to Sisyphus clients. It translates Taskwarrior CLI behavior into stable Task and Board semantics rather than exposing CLI commands directly.
_Avoid_: Generic task protocol, Taskwarrior compatibility server

## Accepted product direction

### Simplicity constraint

Keep both the product and its task-management philosophy simple and minimal.
The user should not need a planning ritual or knowledge of Taskwarrior fields
to use the app. Prefer familiar direct actions, few visible controls, and
predictable results. Starting work must not require a separate daily-selection
step; planning must not change deadlines; dates must not silently unblock work.

The decisions below define behavior, not a requirement to expose a separate
screen, section, or control for every concept. Consolidate secondary review
items into existing surfaces and disclose them only when relevant. Avoid
mandatory daily cleanup, redundant task appearances, and automatic navigation
changes. Where a proposed interaction adds ceremony or surprises, simplify
the interaction while preserving task meaning. Agent mechanics belong in the
skill; users should not have to learn them.

Mobile is a first-class interaction surface: stack Today work sections, keep
Choose from Ready and Deferred discoverable near the top, and provide touch-sized
direct actions without hover or drag requirements. Pickers must fit narrow
screens, scroll internally when needed, and retain visible dismissal controls.
Verify the real choose/start/complete and deferred-return flows on mobile as
well as keyboard navigation and focus restoration on desktop.

Today supports pulling work as capacity becomes available: prioritize Doing,
keep a few Ready Tasks directly accessible, and treat Up next as optional.
Provide quiet completed-today progress and a compact, balanced layout rather
than additional planning requirements. Task details close on outside click with
the same unsaved-edit protection as explicit dismissal. Relevant task actions
are directly visible; avoid a More actions disclosure that merely hides a few
ordinary controls. The command palette includes direct Today navigation.

Today supports drag-and-drop between Ready, Up next, and Doing with the same
meaning as direct actions; deadlines never change as a side effect. Keep touch
and keyboard alternatives. Attention and completed-today access use full-sized
count buttons and readable panels, not tiny disclosure triangles. All read-only
pickers/panels dismiss on backdrop click or Escape and restore trigger focus.

[Today focus and pull-based commitment](docs/adr/0005-today-focus-and-pull-based-commitment.md)
defines the Ready/Doing meanings, Today surface, and agent interpretation.
These behaviors are implemented in the source; production rollout is separate.

[Blockers and deferral](docs/adr/0006-distinguish-blockers-from-deferral.md)
distinguishes committed blocked work in Waiting from intentionally postponed
work, including why a follow-up date does not automatically clear a blocker.

[Project navigation groups](docs/adr/0007-infer-project-navigation-groups.md)
defines inferred Active, Later, and History navigation, cross-group search,
and transitions that preserve the currently open project board.

[Task creation contract](docs/adr/0008-task-creation-contract.md) defines Task
granularity, supported metadata, duplicate discovery, and the agent's creation
and verification process.

[Planning-date rollover](docs/adr/0009-planning-date-rollover.md) defines review
of unfinished daily selections, ongoing work across days, deferral expiry,
and blocker follow-ups without automatic unblocking.

[Taskwarrior field mapping](docs/adr/0010-taskwarrior-field-mapping.md) defines
the native fields and three UDAs shared by the application and agent skill.

## Example Dialogue

> **Product owner:** Move this Task into Doing on the Board.
>
> **Developer:** The Board will update the Task's canonical lifecycle state in Taskwarrior, so the same change remains visible from the CLI.
>
> **Product owner:** Can a visual preference stay only in this browser?
>
> **Developer:** Yes, if it changes only presentation. If it changes the meaning of a Task, it belongs to the Taskwarrior-backed System of Record.
