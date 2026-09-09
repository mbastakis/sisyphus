# Task creation contract

Status: Accepted; agent skill applied and application implemented in source.

## Decision

A Task represents one meaningful, independently finishable outcome. The agent
and user share the following creation contract.

| Property | Rule |
|---|---|
| Title | A concrete action with an observable outcome, such as “Compare three photo-backup options,” rather than “Backups.” |
| Size | Split work when parts can be completed or blocked independently. Do not create a Task for every implementation step; supporting steps belong in annotations. |
| Project | Reuse an existing project when it fits. Introduce a new project name only when the request clearly establishes a new grouping; clarify genuinely ambiguous ownership. |
| Initial state | Backlog by default. Ready requires expressed commitment; Doing requires execution to begin. |
| Today | Select only when the user explicitly intends to work on the Task today. |
| Due date | A real finish-by constraint, never a way to boost urgency or express daily intent. |
| Priority | Set only when supported by the user's stated priorities; otherwise leave unset. |
| Annotations | Supporting context, relevant links, completion criteria when the title is insufficient, and blocker details. |
| Dependencies | Actual prerequisites, not merely a preferred execution order. |
| Tags | No categorization tags. The existing internal `+next` commitment marker is the only permitted tag. |
| Duplicates | Check existing Tasks before creating. Reuse or extend a Task when it represents the same outcome. |

Lifecycle, daily intent, and blocker meanings are defined in ADRs 0005 and 0006.
Creation must preserve those meanings rather than infer commitment from a
deadline, priority, or the mere fact that an action is executable.

## Example

Request: “I want to work on Sisyphus project cleanup today.”

- Title: “Group Sisyphus projects into Active, Later, and History.”
- Project: the existing Sisyphus project name, discovered before creation.
- State: Ready, chosen for today.
- Due: unset.
- Annotation: reference ADR 0007 and add any necessary completion criteria.

This is an example of the intended model, not an instruction to create a Task.

## Agent workflow requirements

Apply the writing-great-skills principles when updating the Taskwarrior skill:

1. **Discover** existing Tasks and project names. Complete when reuse versus
   creation is resolved for each requested outcome.
2. **Shape** each Task. Complete when its title and, where needed, annotations
   make execution and completion understandable.
3. **Classify** using the agreed contract. Complete when every proposed field
   has a reason grounded in user intent or an established rule.
4. **Create and verify** through supported field mappings. Complete when the
   persisted Task matches the intended project, lifecycle, daily intent,
   deadline, priority, dependencies, and permitted tags.

Keep the core creation process in the skill, disclose branch-specific mechanics
such as recurrence through targeted context pointers, and maintain a single
authoritative definition for each domain meaning. Ensure those references are
available wherever the deployed skill runs before relying on them.

The deployed Taskwarrior skill now contains the core workflow and a bundled
`contract.md` for agent interpretation, with `recurrence.md` and `operations.md`
loaded only for their branches. It is managed through the dotfiles source at
`private_dot_agents/skills/taskwarrior/`; runtime agents do not need this checkout.
Field mappings are defined in ADR 0010 and mirrored in that deployed contract.
Changes to task meaning must update both application policy and the deployed
agent contract, with their postconditions checked against the same scenarios.
