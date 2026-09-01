import { useCallback, useEffect, useState } from "react";
import { isSortMode, type SortMode } from "./sort";

/** Device-local per-board presentation preferences (localStorage):
 * collapsed columns, sort override, active mobile column. */
export function useBoardPrefs(boardId: string) {
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [mobileColumn, setMobileColumnState] = useState<string | null>(null);

  useEffect(() => {
    setMobileColumnState(localStorage.getItem(`sisyphus.mobileCol.${boardId}`));
    try {
      setCollapsedCols(
        new Set(JSON.parse(localStorage.getItem(`sisyphus.collapsed.${boardId}`) ?? "[]")),
      );
    } catch {
      setCollapsedCols(new Set());
    }
    const savedSort = localStorage.getItem(`sisyphus.sort.${boardId}`);
    setSortMode(isSortMode(savedSort) ? savedSort : "default");
  }, [boardId]);

  const toggleCollapse = useCallback(
    (columnId: string) => {
      setCollapsedCols((prev) => {
        const next = new Set(prev);
        if (next.has(columnId)) next.delete(columnId);
        else next.add(columnId);
        localStorage.setItem(`sisyphus.collapsed.${boardId}`, JSON.stringify([...next]));
        return next;
      });
    },
    [boardId],
  );

  const selectSort = useCallback(
    (mode: SortMode) => {
      setSortMode(mode);
      localStorage.setItem(`sisyphus.sort.${boardId}`, mode);
    },
    [boardId],
  );

  const setMobileColumn = useCallback(
    (columnId: string) => {
      setMobileColumnState(columnId);
      localStorage.setItem(`sisyphus.mobileCol.${boardId}`, columnId);
    },
    [boardId],
  );

  return { collapsedCols, toggleCollapse, sortMode, selectSort, mobileColumn, setMobileColumn };
}
