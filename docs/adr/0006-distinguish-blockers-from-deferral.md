# Distinguish blockers from deferral

Status: Accepted; implemented in source, production rollout separate.

## Decision

Waiting means committed work cannot progress until a specific condition clears.
It does not mean work has merely been postponed or has not started yet.

| Concept | Meaning | Example |
|---|---|---|
| Waiting | Committed work blocked by a person, event, prerequisite, or external condition. | Waiting for the accountant to send a statement. |
| Deferred | Work intentionally postponed until a particular return date. | Revisit backup options next month. |
| Backlog | Uncommitted work without a promised revisit date. | Consider reorganizing the garage. |

## Waiting contract

- Record the specific condition preventing progress.
- Record a follow-up date when useful; a follow-up date is not a deadline.
- Stop execution when work becomes blocked and preserve its commitment.
- When the blocker clears, return the Task to Ready. Do not start it until
  execution actually resumes.
- Reaching a follow-up date means check the blocker, not assume it has cleared.
  For example, Friday arriving does not mean the accountant sent the statement.

## Deferral contract

Deferred work stays out of the normal actionable view until its return date.
It does not fill the Waiting column. Backlog without a return date remains
ordinary uncommitted work, rather than implicitly scheduled work.

## Implementation consequences

The former mapping of native Taskwarrior waiting status directly to the
Waiting column cannot express this contract by itself. The UI and agent skill
must share representations that distinguish blockers, follow-up dates, and
intentional deferral. ADR 0010 defines those field mappings.

The application source and deployed agent skill now use these distinct meanings.

## Related implementation decisions

- ADR 0010 defines Taskwarrior-backed fields, cross-project prerequisites,
  and uncommitted blocked Backlog classification.
- ADR 0009 defines due follow-up attention and preserved commitment on deferral
  expiry, with deferred-task discovery from ADR 0007.
