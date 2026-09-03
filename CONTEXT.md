# Sisyphus

Sisyphus provides visual personal Boards over Tasks whose canonical meaning and lifecycle remain owned by Taskwarrior.

## Language

**Task**:
A unit of work identified by its stable Taskwarrior identity and usable from both Sisyphus and ordinary Taskwarrior clients.
_Avoid_: Card, issue, work item

**Board**:
A named lens over the Task Universe, defined by a Task scope, columns, ordering, and presentation. Lifecycle and Daily are server-configured core Boards; exact Taskwarrior project names generate Project Boards automatically. Boards may overlap and never own a separate copy of Task state.
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

## Example Dialogue

> **Product owner:** Move this Task into Doing on the Board.
>
> **Developer:** The Board will update the Task's canonical lifecycle state in Taskwarrior, so the same change remains visible from the CLI.
>
> **Product owner:** Can a visual preference stay only in this browser?
>
> **Developer:** Yes, if it changes only presentation. If it changes the meaning of a Task, it belongs to the Taskwarrior-backed System of Record.
