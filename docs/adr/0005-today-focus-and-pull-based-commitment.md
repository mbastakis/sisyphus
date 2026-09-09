# Today focus and pull-based commitment

Status: Accepted; implemented in source, production rollout separate.

## Decision

Lifecycle remains the default landing experience. Project Boards retain their
full lifecycle Kanban. Replace the current Daily deadline-column experience
with a cross-project Today work surface over the same Tasks.

This supersedes the Daily presentation direction in ADR 0004, not the current
configuration identity. ADR 0010 defines field mappings and compatibility;
legacy Daily configuration is normalized and no longer writes planning deadlines.

## Commitment contract

| Concept | Meaning |
|---|---|
| Backlog | Work worth retaining, but not committed. |
| Ready | A small committed pool to pull from next; nothing prevents starting. |
| Doing | Started work that remains in progress. |
| Today selection | Deliberate intent to give a Task attention today, independent of its deadline. |

Ready is not a commitment for a specific calendar week. Review it regularly
without automatically expiring commitment at a week boundary.

Doing does not track moment-by-moment activity. Lunch breaks and overnight
pauses do not require a state change. Intentionally shelving unblocked work
returns it to Ready; work that cannot progress belongs in Waiting. Keep Doing
small, ideally one main Task, with approximately three as a soft limit.

## Today surface

- **Needs attention:** a compact, separate section for due and overdue Tasks.
  A deadline does not automatically create daily intent or commitment.
- **Doing:** all in-progress Tasks, including work started on previous days,
  whether or not explicitly selected for today.
- **Chosen for today:** Ready Tasks explicitly selected for today.
- **Done today:** a count button opening completed-today history.
- **Choose from Ready:** a visible action opening a picker for the remaining Ready pool.
  Tasks can be selected for today or started directly.

The UI must make the reason a Task appears clear: ongoing work, explicit daily
intent, or deadline attention. Today remains useful with no explicit selections.
Starting a Task makes it visible in Doing without a separate planning step.
Selecting a Backlog Task for today also commits it to Ready, provided it is
unblocked. Selection never changes its deadline or starts execution.

## Pull-based interaction

The user's preferred daily workflow is to pull as capacity becomes available.
Prioritize Doing, keep a small Ready preview directly within reach with Start
actions, and retain a visible picker action for the full pool. Up next is the
user-facing label for Tasks chosen for today, not another lifecycle state. It
remains an optional shortlist; its empty state must not dominate the page,
especially on mobile. Provide Start and Complete directly at the Task surface.

Show a quiet completed-today count linked to history, without targets, streaks,
or mandatory daily planning. Avoid duplicate full Tasks across work sections.
Keep deadline/review attention compact and secondary to execution. Deferred
Tasks have a visible count-bearing control near the top of the board. Its panel
supports keyboard opening, navigation, Escape, and focus return, with return
dates and direct Return now actions.

This replaces the first iteration's empty shortlist emphasis, picker-only Ready
flow, and hidden footer deferral control, following hands-on user review.

Provide an explicit **Go to Today** command in the command palette. Daily
navigation and the choose/start/complete flow must work entirely by keyboard.

Today also supports drag and drop: Ready to Up next chooses today; Ready or
Up next to Doing starts; Doing to Up next stops and chooses today; returning to
the Ready pool stops and clears daily selection without withdrawing commitment.
Buttons remain available for touch and keyboard use. Show target highlights
during a drag, not as permanent emphasis on a work section.

Needs attention and Done today use generously sized count buttons opening
readable panels, rather than tiny disclosure triangles. Deferred, Ready,
attention, and history panels close on backdrop click or Escape and restore
focus to their trigger. Clicking inside their content does not dismiss them.

## Agent interpretation

- Capturing possible work defaults to Backlog.
- An explicit intention to tackle work next means Ready.
- An explicit intention to work on it today means Ready plus daily selection,
  provided it is unblocked.
- Starting execution means Doing; creating or planning a Task alone does not.
- A finish-by instruction sets a deadline, not automatic commitment or start.
- Do not invent categorization tags or a Today tag. The current `+next` marker
  is an implementation detail for commitment, not a categorization feature.

## Related implementation decisions

- ADR 0006 distinguishes Waiting and deferral.
- ADR 0010 defines daily-intent fields, server date boundaries, and the
  due-today/overdue attention horizon.
- ADR 0009 defines unfinished daily-selection review. A selection that becomes
  blocked retains its planning context and appears for blocker attention,
  rather than remaining actionable under Up next.

The application source and deployed Taskwarrior skill implement this decision.
Application production rollout is separate from source verification.
