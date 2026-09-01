# Use a product-specific API over an internal CLI adapter

The HTTP API will expose Sisyphus Board and Task semantics, while Taskwarrior CLI access is isolated behind an internal repository port with one production adapter. We rejected a universal task protocol and compatibility APIs for other Kanban products because they would weaken Taskwarrior behavior or require reimplementing another product's domain.
