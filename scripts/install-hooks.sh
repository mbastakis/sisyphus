#!/bin/sh
set -eu
cd "$(git rev-parse --show-toplevel)"
current=$(git config --get core.hooksPath || true)
if [ -n "$current" ] && [ "$current" != .githooks ]; then
    echo "core.hooksPath is already '$current'; reconcile the existing hooks first." >&2
    exit 1
fi
chmod +x .githooks/pre-commit .githooks/pre-push
git config --local core.hooksPath .githooks
echo 'Installed native Git hooks from .githooks.'
