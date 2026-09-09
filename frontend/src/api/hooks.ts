import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { loadProjectionCache, saveProjectionCache } from "./offline";
import type { BoardSummary, Projection, SystemInfo } from "./types";

export function useBoards() {
  return useQuery({
    queryKey: ["boards"],
    queryFn: () => api<BoardSummary[]>("/api/v1/boards"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useBoard(boardId: string | null, history = false) {
  const cacheId = `${boardId}${history ? ":history" : ""}`;
  return useQuery({
    queryKey: history ? ["board", boardId, "history"] : ["board", boardId],
    queryFn: async () => {
      const projection = await api<Projection>(`/api/v1/boards/${boardId}${history ? "?history=true" : ""}`);
      if (boardId) saveProjectionCache(cacheId, projection);
      return projection;
    },
    enabled: boardId !== null,
    // Cold-start placeholder from the last successful projection so the board
    // paints instantly and stays inspectable offline. The offline banner
    // (BoardPage) marks it stale whenever the live fetch is failing.
    placeholderData: () =>
      boardId ? loadProjectionCache(cacheId)?.projection : undefined,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useSystem() {
  return useQuery({
    queryKey: ["system"],
    queryFn: () => api<SystemInfo>("/api/v1/system"),
    staleTime: 5 * 60_000,
  });
}
