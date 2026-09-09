# Taskwarrior field mapping for simple planning

Status: Accepted implementation decision.

## Decision

Keep task meaning in native Taskwarrior fields and three explicit UDAs. Derive
views and project navigation from those fields; do not add a project database
or a nightly job that rewrites planning intent.

| Meaning | Representation |
|---|---|
| Commitment | `+next`, the only permitted application/agent tag |
| Execution and completion | Native `start`, `status`, and `end` |
| Actual deadline | Native `due` |
| Intentional deferral | Native `wait` |
| Prerequisites | Native `depends`, resolved across projects |
| Context and supporting steps | Native annotations |
| Chosen day | Date UDA `sisyphus_plan` |
| Current external blocking condition | String UDA `sisyphus_blocker` |
| Blocker review day | Date UDA `sisyphus_followup` |

Native `scheduled` retains its existing meaning; it is not daily selection.
Current blocker text is authoritative in its UDA; annotations may preserve
context or history but do not imply a still-unresolved blocker.

Declare the UDAs in both container and workstation taskrc: TaskChampion task
sync does not distribute taskrc declarations. Date-only planning, follow-up,
and deferral inputs use the server's local midnight; date-only deadlines use
the end of that day. Preserve explicit native timestamps.

## Derived behavior

- Future native wait hides work from the normal actionable surface. Preserve
  commitment and blockers so returning work has the correct meaning.
- A committed Task with an unresolved condition or prerequisite is Waiting.
  An uncommitted dependency-blocked Task stays Backlog, visibly blocked.
- Starting work establishes commitment. Application blocking and deferral stop
  execution. Clearing an external blocker never clears unfinished dependencies.
- Recording or resolving a blocker as a fact preserves existing commitment.
  An explicit move to Waiting expresses commitment; factual blocker edits on
  uncommitted work do not silently promote it from Backlog.
- Deferring explicitly clears daily selection. Date expiry never selects work
  for today, starts it, or clears a blocker.
- Attention includes deadlines due today or earlier and due follow-ups. Older
  daily selections are reviewable without automatically rolling forward.
- Projection reads do not repair or mutate externally authored Task data.

## Compatibility

Retain the `daily` board ID for existing links/preferences, but display Today
and eliminate its old due-date column writes. Legacy board configuration must
not restore those writes.

Existing `wait` values are deferrals. Existing `due` values remain deadlines.
Neither field contains enough provenance to infer whether a previous client
used it for blocking or planning. Do not silently migrate or clear those values.

Application policy and the deployed Taskwarrior skill must agree on these
mappings. Expose ordinary product actions in the UI rather than raw UDA names.

## Verification evidence

`scripts/check-taskwarrior-contract.py` runs against a disposable replica in
the pinned Taskwarrior 3.4.2 image. It verifies UDA roundtrips, local-midnight
dates across Europe/Athens DST, preservation of dependencies when clearing an
external blocker, execution, deferral, and unchanged deadlines. It mounts no
personal task data and does not sync. In particular, native export may show
`status:pending` with future `wait`; use the timestamp to derive deferral.
