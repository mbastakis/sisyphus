import { useCallback, useEffect, useState } from "react";
import type { BoardColumnDto, Card } from "../api/types";

export interface RenderColumn {
  col: BoardColumnDto;
  cards: Card[];
}

/** Roving card focus and bulk selection over the visible (non-collapsed)
 * columns, with j/k/h/l-style movement semantics. */
export function useCardFocus(visibleColumns: RenderColumn[]) {
  const [focusUuid, setFocusUuid] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!focusUuid) return;
    document
      .querySelector(`[data-uuid="${focusUuid}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusUuid]);

  const focusFirst = useCallback(() => {
    const first = visibleColumns.find((c) => c.cards.length > 0)?.cards[0];
    if (first) setFocusUuid(first.uuid);
  }, [visibleColumns]);

  const moveFocus = useCallback(
    (dir: -1 | 1) => {
      if (!focusUuid) {
        focusFirst();
        return;
      }
      for (const { cards } of visibleColumns) {
        const i = cards.findIndex((c) => c.uuid === focusUuid);
        if (i >= 0) {
          const next = cards[Math.max(0, Math.min(cards.length - 1, i + dir))];
          setFocusUuid(next.uuid);
          return;
        }
      }
    },
    [focusUuid, visibleColumns, focusFirst],
  );

  const moveFocusColumn = useCallback(
    (dir: -1 | 1) => {
      if (!focusUuid) {
        focusFirst();
        return;
      }
      let colIdx = -1;
      let rowIdx = 0;
      visibleColumns.forEach(({ cards }, ci) => {
        const i = cards.findIndex((c) => c.uuid === focusUuid);
        if (i >= 0) {
          colIdx = ci;
          rowIdx = i;
        }
      });
      if (colIdx < 0) return;
      let i = colIdx + dir;
      while (i >= 0 && i < visibleColumns.length) {
        const cards = visibleColumns[i].cards;
        if (cards.length > 0) {
          setFocusUuid(cards[Math.min(rowIdx, cards.length - 1)].uuid);
          return;
        }
        i += dir;
      }
    },
    [focusUuid, visibleColumns, focusFirst],
  );

  const toggleSelected = useCallback((uuid: string) => {
    setSelection((sel) => {
      const next = new Set(sel);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelection(new Set());
    setFocusUuid(null);
  }, []);

  return {
    focusUuid,
    setFocusUuid,
    selection,
    setSelection,
    toggleSelected,
    focusFirst,
    moveFocus,
    moveFocusColumn,
    clear,
  };
}
