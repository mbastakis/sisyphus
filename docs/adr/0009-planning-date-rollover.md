# Planning-date rollover

Status: Accepted; implemented in source, production rollout separate.

## Decision

Passing a planning or follow-up date must not invent a deadline, start execution,
or imply that a blocker has cleared.

| Event | Behavior |
|---|---|
| A daily selection passes without execution starting | Keep the Task Ready. Surface it in an “Unfinished daily plans” review section, where the user can select it for today or clear its daily selection. Do not automatically roll it into today's chosen Tasks. |
| A Doing Task crosses a day boundary | Keep it Doing and visible in Today. |
| A deferral ends | Restore normal visibility in its previous commitment state: Backlog if uncommitted, Ready if committed and unblocked. Do not automatically select it for today. |
| A Waiting follow-up date arrives | Surface the Task under Needs attention with its blocker and a “Review blocker” action. Keep it Waiting until the blocking condition actually clears. |

Clearing an old daily selection does not withdraw the Task's Ready commitment.
Restoring visibility after deferral does not override an unresolved blocker.

## Review behavior

- ADR 0010 defines Taskwarrior-backed representations and server-local date
  boundaries.
- A previously chosen Task that becomes blocked retains its selection as context
  and appears for blocker attention, not as actionable chosen work.
- Reviewing an unresolved blocker preserves its condition. The follow-up form
  shows the existing review date; the user can explicitly reschedule or clear it.

The application source and deployed agent skill implement these behaviors;
application production rollout is separate.
