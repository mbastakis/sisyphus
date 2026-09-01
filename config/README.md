# Board configuration

`boards.yaml` defines every board server-side (there is no in-app editor).
Validate after editing:

```bash
task config:validate
```

Schema highlights (full semantics in `docs/architecture-plan.md` §6):

- `template: lifecycle | project-lifecycle | daily` expands preset columns;
  explicit `columns:` override or extend them.
- Column `match` and `write` are separate: a column may match tasks it cannot
  accept (`write: null` = read-only, rejected server-side too).
- `write.prompt` asks the user for a value on drop (Waiting/wait date,
  Upcoming/due date).
- `ordering.mode: manual` requires a unique `rank_uda`; the container
  entrypoint generates the matching `uda.*` taskrc declarations.
- Board and column ids are stable slugs — renaming a board must not change
  its id or rank UDA.

Config changes require a backend restart.
