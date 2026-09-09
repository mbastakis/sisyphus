"""Pure task meaning and transitions, independent of boards and repositories."""
from __future__ import annotations

from datetime import UTC, date, datetime, time

from . import commands as cmd
from .errors import ValidationError
from .task import Task, local_date, server_timezone

PLAN = "sisyphus_plan"
BLOCKER = "sisyphus_blocker"
FOLLOWUP = "sisyphus_followup"


def date_value(value: str | None) -> date | None:
    if not value:
        return None
    try:
        if len(value) == 10:
            return date.fromisoformat(value)
        if value.endswith("Z") and "-" not in value:
            return local_date(datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC))
        return local_date(datetime.fromisoformat(value))
    except (ValueError, TypeError, AttributeError):
        # External clients may leave malformed metadata. Reads remain usable;
        # all API date writes go through the strict midnight parser below.
        return None


def midnight(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        day = date.fromisoformat(value)
    except (ValueError, TypeError) as exc:
        raise ValidationError("date must be YYYY-MM-DD") from exc
    return datetime.combine(day, time.min, server_timezone())


def describe(task: Task, universe: dict[str, Task], now: datetime) -> dict:
    today = local_date(now)
    unfinished = task.status in ("pending", "waiting")
    dependencies = [
        {"uuid": uuid, "description": universe[uuid].description if uuid in universe else "Unknown task"}
        for uuid in task.depends
        if uuid not in universe or universe[uuid].status not in ("completed", "deleted")
    ]
    blocker = (task.udas.get(BLOCKER) or "").strip() or None
    blocked = bool(blocker or dependencies)
    deferred = unfinished and task.wait is not None and task.wait > now
    committed = "next" in task.tags or (unfinished and task.start is not None)
    plan = date_value(task.udas.get(PLAN))
    followup = date_value(task.udas.get(FOLLOWUP))
    if not unfinished:
        lifecycle = {"completed": "done", "deleted": "deleted"}.get(task.status, "recurring")
    elif not committed:
        lifecycle = "backlog"
    elif blocked:
        lifecycle = "waiting"
    elif task.start and not deferred:
        lifecycle = "doing"
    else:
        lifecycle = "ready"
    reasons = []
    if unfinished and task.due and local_date(task.due) <= today:
        reasons.append("overdue" if local_date(task.due) < today else "due_today")
    if unfinished and not deferred:
        if blocked and followup and followup <= today:
            reasons.append("follow_up")
        if plan and plan <= today and blocked:
            reasons.append("blocked_plan")
        if plan and plan < today and lifecycle != "doing":
            reasons.append("unfinished_plan")
    actions = []
    if task.status == "completed":
        actions = ["reopen"]
    elif unfinished:
        actions = ["complete", "block", "defer"]
        if plan:
            actions.append("clear_plan")
        if blocker:
            actions.append("clear_blocker")
        if blocked:
            actions.append("follow_up")
        if deferred:
            actions.append("return_now")
        else:
            actions.append("backlog")
            if not blocked:
                actions.extend(["plan_today", "ready", "up_next", "ready_pool"])
                if lifecycle != "doing":
                    actions.append("start")
            if task.start:
                actions.append("stop")
    return {
        "lifecycle": lifecycle, "committed": committed, "deferred": deferred,
        "planned_for": plan.isoformat() if plan else None,
        "deferred_until": task.wait.isoformat() if task.wait else None,
        "blocker": blocker, "follow_up_on": followup.isoformat() if followup else None,
        "open_dependencies": dependencies, "attention_reasons": reasons,
        "allowed_actions": actions,
    }


def transition(
    task: Task, universe: dict[str, Task], now: datetime, action: str,
    *, date: str | None = None, blocker: str | None = None,
) -> list[cmd.TaskMutation]:
    state = describe(task, universe, now)
    if action not in state["allowed_actions"]:
        raise ValidationError(f"action {action!r} is not available for this task")
    muts: list[cmd.TaskMutation] = []
    if action == "start":
        muts = [cmd.AddTag("next"), cmd.Start()]
    elif action == "stop":
        muts = [cmd.AddTag("next"), cmd.Stop()]
    elif action == "complete":
        muts = [cmd.Complete()]
    elif action == "reopen":
        muts = [cmd.Reopen(), cmd.Stop()]
    elif action == "plan_today":
        today = local_date(now).isoformat()
        if date is not None and date != today:
            raise ValidationError("plan_today accepts only today's date")
        muts = [cmd.AddTag("next"), cmd.SetUda(PLAN, midnight(today).isoformat())]
    elif action == "clear_plan":
        muts = [cmd.SetUda(PLAN, None)]
    elif action == "up_next":
        muts = [cmd.Stop(), cmd.AddTag("next"),
                cmd.SetUda(PLAN, midnight(local_date(now).isoformat()).isoformat())]
    elif action == "ready_pool":
        muts = [cmd.Stop(), cmd.AddTag("next"), cmd.SetUda(PLAN, None)]
    elif action == "block":
        if not blocker or not blocker.strip():
            raise ValidationError("a specific blocker is required")
        if state["committed"]:
            muts.append(cmd.AddTag("next"))
        muts.extend([cmd.Stop(), cmd.SetUda(BLOCKER, blocker.strip())])
        if date is not None:
            muts.append(cmd.SetUda(FOLLOWUP, midnight(date).isoformat()))
    elif action == "clear_blocker":
        muts = [cmd.SetUda(BLOCKER, None), cmd.SetUda(FOLLOWUP, None), cmd.Stop()]
        if state["committed"]:
            muts.insert(0, cmd.AddTag("next"))
    elif action == "follow_up":
        day = midnight(date)
        muts = [cmd.SetUda(FOLLOWUP, day.isoformat() if day else None)]
    elif action == "defer":
        day = midnight(date)
        if day is None or day <= now:
            raise ValidationError("deferral requires a future date")
        if state["committed"]:
            muts.append(cmd.AddTag("next"))
        muts.extend([cmd.Stop(), cmd.SetField("wait", day), cmd.SetUda(PLAN, None)])
    elif action == "return_now":
        muts = [cmd.SetField("wait", None)]
    elif action == "ready":
        muts = [cmd.Stop(), cmd.AddTag("next")]
    elif action == "backlog":
        muts = [cmd.Stop(), cmd.RemoveTag("next"), cmd.SetUda(PLAN, None)]
    return muts


def validate_dependencies(uuids: list[str], universe: dict[str, Task], own: str | None = None):
    if not isinstance(uuids, list) or any(not isinstance(u, str) for u in uuids):
        raise ValidationError("dependencies must be a UUID list")
    for uuid in uuids:
        if uuid not in universe or universe[uuid].status not in ("pending", "waiting"):
            raise ValidationError(f"dependency {uuid!r} must reference an unfinished task")
        seen = set()
        stack = [uuid]
        while stack:
            current = stack.pop()
            if current == own:
                raise ValidationError("dependencies cannot form a cycle")
            if current in seen:
                continue
            seen.add(current)
            if current in universe:
                stack.extend(universe[current].depends)
