import type { QueryClient } from "@tanstack/react-query";
import type { Projection } from "./types";

export function subscribeToTaskChanges(qc: QueryClient): () => void {
  let source: EventSource | null = null;
  let stopped = false;

  const connect = () => {
    const generations = qc
      .getQueriesData<Projection>({ queryKey: ["board"] })
      .map(([, projection]) => projection?.generation ?? -1);
    const generation = generations.length > 0 ? Math.max(...generations) : -1;
    source = new EventSource(`/api/v1/events?generation=${generation}`);
    source.onmessage = (event) => {
      const change = JSON.parse(event.data) as { type: string; generation: number };
      if (change.type !== "tasks.changed") return;
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["boards"] });
      qc.invalidateQueries({ queryKey: ["system"] });
    };
    source.onerror = () => {
      source?.close();
      source = null;
      if (!stopped) window.setTimeout(connect, 2_000);
    };
  };

  connect();
  return () => {
    stopped = true;
    source?.close();
  };
}
