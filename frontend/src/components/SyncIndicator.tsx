import type { SyncState } from "../api/types";
import { timeOnly } from "../lib/dates";

interface Props {
  sync: SyncState | undefined;
  fetching: boolean;
  online: boolean;
  degraded: boolean;
}

export function SyncIndicator({ sync, fetching, online, degraded }: Props) {
  if (!online) {
    return (
      <span className="sync sync-offline" title="Offline — mutations disabled">
        ● offline
      </span>
    );
  }
  if (degraded) {
    return (
      <span
        className="sync sync-degraded"
        title={`Sync degraded${sync?.detail ? `: ${sync.detail}` : ""}`}
      >
        ▲ degraded
      </span>
    );
  }
  if (fetching) {
    return (
      <span className="sync sync-busy" title="Refreshing">
        ↻
      </span>
    );
  }
  return (
    <span
      className="sync sync-ok"
      title={sync?.last_success ? `Synced ${timeOnly(sync.last_success)}` : "Synced"}
    >
      ✓
    </span>
  );
}
