# Configure core Boards in server-side YAML

Sisyphus defines the Lifecycle and Daily core Boards in versioned server-side
YAML. The configuration accepts exactly those two stable Board IDs, including
their scopes, column mappings, write rules, presentation, and ordering.

Project Boards are not configured. They are generated automatically for each
exact Taskwarrior project name that has tasks in lifecycle scope. Taskwarrior
still owns the Task Universe; manual ordering is stored on Tasks through the
documented lifecycle and shared project rank UDAs.
