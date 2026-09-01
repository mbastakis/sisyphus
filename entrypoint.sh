#!/bin/bash
# Sisyphus container entrypoint. Refuses to guess anything that could corrupt
# the Taskwarrior replica or silently weaken the deployment:
#   - TZ is mandatory (date-relative columns follow the server clock);
#   - SISYPHUS_AUTH is mandatory (use "none" only behind your own auth);
#   - TASK_SYNC_ENCRYPTION_SECRET is mandatory for TaskChampion sync
#     (set TASK_SYNC_DISABLED=1 for a local-only replica).
set -euo pipefail

SISYPHUS_CONFIG_DIR="${SISYPHUS_CONFIG_DIR:-/config}"
SISYPHUS_DATA="${SISYPHUS_DATA:-/data}"
SISYPHUS_HOST="${SISYPHUS_HOST:-0.0.0.0}"
SISYPHUS_PORT="${SISYPHUS_PORT:-8080}"

if [[ -z "${TZ:-}" ]]; then
    printf '%s\n' "TZ is required (e.g. TZ=Europe/Athens): Daily-board columns and due:today writes follow the server timezone" >&2
    exit 1
fi

if [[ -z "${SISYPHUS_AUTH:-}" ]]; then
    printf '%s\n' "SISYPHUS_AUTH is required: 'basic' (with SISYPHUS_AUTH_USER/SISYPHUS_AUTH_PASSWORD), 'proxy' (behind a trusted reverse proxy), or explicitly 'none'" >&2
    exit 1
fi

if [[ "${SISYPHUS_REPOSITORY:-cli}" == "cli" ]]; then
    if [[ -z "${TASK_SYNC_ENCRYPTION_SECRET:-}" && "${TASK_SYNC_DISABLED:-}" != "1" ]]; then
        printf '%s\n' "TASK_SYNC_ENCRYPTION_SECRET is required (or set TASK_SYNC_DISABLED=1 for a local-only replica)" >&2
        exit 1
    fi
fi

mkdir -p "$SISYPHUS_CONFIG_DIR" "$SISYPHUS_DATA"
umask 077

# Board config: mounted /config/boards.yaml wins; otherwise install the
# image default once so the container starts out of the box.
if [[ ! -f "$SISYPHUS_CONFIG_DIR/boards.yaml" ]]; then
    cp /app/boards.default.yaml "$SISYPHUS_CONFIG_DIR/boards.yaml"
fi
export SISYPHUS_CONFIG="$SISYPHUS_CONFIG_DIR/boards.yaml"

python3 -m sisyphus.config.check "$SISYPHUS_CONFIG"

if [[ "${SISYPHUS_REPOSITORY:-cli}" == "cli" ]]; then
    {
        cat <<EOF
# Generated at container startup. Edits are overwritten on restart.
data.location=$SISYPHUS_DATA
confirmation=no
verbose=default,-override
color=off
dateformat=Y-M-D
dateformat.edit=Y-M-D H:N:S
weekstart=Monday
EOF
        if [[ "${TASK_SYNC_DISABLED:-}" != "1" ]]; then
            cat <<EOF
sync.server.url=${TASK_SYNC_SERVER_URL:-http://taskchampion-sync:8080}
sync.server.client_id=${TASK_SYNC_CLIENT_ID:?TASK_SYNC_CLIENT_ID is required when sync is enabled}
sync.encryption_secret=$TASK_SYNC_ENCRYPTION_SECRET
EOF
        fi
        # Declare every configured rank UDA so Taskwarrior and other clients
        # sharing the replica handle Sisyphus rank fields first-class.
        python3 -m sisyphus.config.check --taskrc-udas "$SISYPHUS_CONFIG"
    } >"$SISYPHUS_CONFIG_DIR/taskrc"

    export SISYPHUS_TASKRC="$SISYPHUS_CONFIG_DIR/taskrc"
    export SISYPHUS_TASKDATA="$SISYPHUS_DATA"
fi

exec uvicorn sisyphus.main:app --host "$SISYPHUS_HOST" --port "$SISYPHUS_PORT"
