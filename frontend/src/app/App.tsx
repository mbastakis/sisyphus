import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  const [boardId, setBoardId] = useState<string | null>(
    () => localStorage.getItem("sisyphus.lastBoard"),
  );

  useEffect(() => {
    if (boards.data && boards.data.length > 0) {
      const valid = boardId && boards.data.some((b) => b.id === boardId);
      if (!valid) setBoardId(boards.data[0].id);
    }
  }, [boards.data, boardId]);

  const select = (id: string) => {
    setBoardId(id);
    localStorage.setItem("sisyphus.lastBoard", id);
  };

  if (boards.isError) {
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
