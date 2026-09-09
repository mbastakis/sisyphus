import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { subscribeToTaskChanges } from "../api/events";
import { useBoards } from "../api/hooks";
import { BoardPage } from "../boards/BoardPage";
import { ToastProvider } from "../components/Toasts";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5_000 },
  },
});

function BoardChooser() {
  const boards = useBoards();

  useEffect(() => subscribeToTaskChanges(queryClient), []);
  const [boardId, setBoardId] = useState<string | null>(
    () => localStorage.getItem("sisyphus.lastBoard"),
  );

  useEffect(() => {
    if (boards.data && boards.data.length > 0) {
      const valid = boardId && boards.data.some((b) => b.id === boardId);
      if (!boardId && !valid) setBoardId(boards.data.find((b) => b.id === "lifecycle")?.id ?? boards.data[0].id);
    }
  }, [boards.data, boardId]);

  const select = (id: string) => {
    setBoardId(id);
    localStorage.setItem("sisyphus.lastBoard", id);
  };

  // Only take the board down when there is nothing to show. A failed
  // background refetch (backend restart, expired session, blip) keeps the
  // mounted board — and any open dialog — intact; BoardPage shows its
  // offline banner instead.
  if (boards.isError && !boards.data) {
    return (
      <div className="board-message board-message-page">
        <p>Cannot reach the Sisyphus backend.</p>
        <button className="btn-primary" onClick={() => boards.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  if (!boardId) return null;
  return <BoardPage boardId={boardId} onSelectBoard={select} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BoardChooser />
      </ToastProvider>
    </QueryClientProvider>
  );
}
