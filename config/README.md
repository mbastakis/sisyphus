# Board configuration

`boards.yaml` configures the two built-in boards: `lifecycle` and `daily`.
Those are the only boards allowed in this file. Project boards are generated
automatically from exact Taskwarrior project names and cannot be configured
manually.

Validate after editing:

```bash
mise exec task -- task config:validate
```

Schema highlights:

- `lifecycle` must use `template: lifecycle`; `daily` must use
  `template: daily`.
- Column `match` and `write` are separate: a column may match tasks it cannot
  accept (`write: null` = read-only, rejected server-side too).
- `write.prompt` asks the user for a value on drop (Waiting/wait date,
  Upcoming/due date).
- Manual ordering requires a unique `rank_uda`; dynamic project boards use the
  reserved `sisyphus_rank_project` UDA.
- Board and column ids are stable slugs.

Config changes require a backend restart.
