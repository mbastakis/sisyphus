# Infer project navigation groups

Status: Accepted; implemented in source, production rollout separate.

## Decision

Infer project navigation groups from Tasks rather than introducing explicit
project statuses or archive actions. Project names continue to identify task
groupings, not independently managed project entities.

| Group | Task content | Navigation |
|---|---|---|
| Active | At least one non-deferred Ready, Doing, or Waiting Task. | Main project list. |
| Later | Unfinished Tasks exist, but all are Backlog or deferred. | Collapsed section in the project picker. |
| History | Completed Tasks exist and no unfinished Tasks remain. | Separate searchable history screen. |

Active counts represent committed unfinished Tasks: Ready, Doing, and Waiting,
excluding deferred Tasks. Explain the count in a tooltip. Later shows useful
backlog counts or deferral information instead of an ambiguous active count.

Search in the project picker spans all three groups and labels Later and
History results so users do not need to remember where a project is listed.

## Later experience

Opening a Later project opens its ordinary lifecycle Kanban. Explain its state
with a quiet message: “No committed work · This project contains backlog or
deferred tasks.” Deferred Tasks remain discoverable through a count-bearing
Deferred control on the board.

Promoting an unblocked Task to Ready automatically moves its project into
Active; no separate project-reactivation action is required.

## History experience

Browse history opens a searchable project list showing the last task-completion
date, newest first. Opening a project shows completed Tasks newest first, with
access to descriptions, annotations, and completion dates. This history must
reach beyond the normal board's recent-Done retention window.

Say “No unfinished tasks,” not “Project completed”: task state does not establish
that the user has formally completed the project's outcome.

Users can add a Task or reopen a completed Task from history. The project then
returns to Later or Active according to its unfinished Tasks.

## Calm transitions

Reclassification updates navigation without navigating away from an open
project board. Completing the final unfinished Task keeps the completed Task
visible normally and shows: “No unfinished tasks. This project is now in History.”
Moving the final committed Task to Backlog similarly keeps the current board
open while its project moves to Later.

## Implementation notes

- Grouped navigation replaces the former single project list and recent-completion
  inclusion rule.
- Historical project search and completed-task retrieval extend beyond retention.
- Groups use the commitment and deferral semantics in ADRs 0005–0006.
- Recurring templates keep a project discoverable in Later when there are no
  actionable instances; never display the template as an executable Task or
  treat a continuing series as completed-only History. Omit deleted-only
  project names. These are derived visibility rules, not project statuses.

The application source implements this navigation; production rollout is separate.
