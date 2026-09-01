import { useEffect, useState } from "react";
import type { Projection } from "./types";

/** Last-successful-projection cache per board (localStorage), used as
 * placeholder data on cold start and as the read-only data source while
 * offline. The staleness timestamp is surfaced in the offline banner —
 * cached data is never presented as fresh. */

interface CachedProjection {
  at: string;
  projection: Projection;
}

const cacheKey = (boardId: string) => `sisyphus.cache.${boardId}`;

export function saveProjectionCache(boardId: string, projection: Projection): void {
  try {
    localStorage.setItem(
      cacheKey(boardId),
      JSON.stringify({ at: new Date().toISOString(), projection }),
    );
  } catch {
    // Quota or private-mode failure: the cache is a convenience layer only.
  }
}

export function loadProjectionCache(boardId: string): CachedProjection | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(boardId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedProjection;
    if (!parsed?.projection?.columns) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}
