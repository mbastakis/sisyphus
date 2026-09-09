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
- Waiting drops request specific blocker text. Native `wait` is exclusively
  deferral, available through semantic task actions.
- `daily` is the stable ID of Today. Its columns are empty; any legacy deadline
  columns are normalized away at load time, with no task or deadline writes.
- Commitment always uses `+next`; legacy `ready_tag` overrides normalize to it.
- Startup declares `sisyphus_plan` and `sisyphus_followup` as date UDAs and
  `sisyphus_blocker` as a string UDA, as well as rank UDAs.
- Server `TZ` defines day boundaries. Planning/follow-up/deferral dates use
  midnight; date-only deadlines use end-of-day. Native `scheduled` is untouched.
- Manual ordering requires a unique `rank_uda`; dynamic project boards use the
  reserved `sisyphus_rank_project` UDA.
- Board and column ids are stable slugs.

Config changes require a backend restart.
