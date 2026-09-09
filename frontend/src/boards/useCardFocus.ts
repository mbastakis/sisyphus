import { useCallback, useEffect, useState } from "react";
import type { BoardColumnDto, Card } from "../api/types";

export interface RenderColumn {
  col: BoardColumnDto;
  cards: Card[];
}

export function cardElement(uuid: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.card[data-uuid="${uuid}"]`);
}

/** Roving card focus and bulk selection over the visible (non-collapsed)
 * columns, with j/k/h/l-style movement semantics.
 *
 * The focused card is also the DOM-focused element: keyboard movement calls
 * `.focus()` on the card so Tab order, screen readers and the visual ring all
 * agree, and a card that receives DOM focus by other means (Tab, click)
 * reports back through `setFocusUuid`. */
export function useCardFocus(visibleColumns: RenderColumn[]) {
  const [focusUuid, setFocusUuid] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!focusUuid) return;
    const el = cardElement(focusUuid);
    if (!el) return;
    if (document.activeElement !== el) {
      // Only steal focus from the page body or another card, never from a
      // form control the user is typing in.
      const active = document.activeElement as HTMLElement | null;
      const typing =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable);
      if (!typing) el.focus({ preventScroll: true });
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusUuid]);

  // Drop focus and selection for cards that left the visible board (moved
  // to a collapsed column, filtered out, or completed on a project board).
  useEffect(() => {
    const visible = new Set<string>();
    visibleColumns.forEach(({ cards }) => cards.forEach((c) => visible.add(c.uuid)));
    setSelection((sel) => {
      if ([...sel].every((u) => visible.has(u))) return sel;
      return new Set([...sel].filter((u) => visible.has(u)));
    });
  }, [visibleColumns]);

  const locate = useCallback(
    (uuid: string | null): { colIdx: number; rowIdx: number } | null => {
      if (!uuid) return null;
      for (let ci = 0; ci < visibleColumns.length; ci++) {
        const i = visibleColumns[ci].cards.findIndex((c) => c.uuid === uuid);
        if (i >= 0) return { colIdx: ci, rowIdx: i };
      }
      return null;
    },
    [visibleColumns],
  );

  const focusFirst = useCallback(() => {
    const first = visibleColumns.find((c) => c.cards.length > 0)?.cards[0];
    if (first) setFocusUuid(first.uuid);
  }, [visibleColumns]);

  const focusLast = useCallback(() => {
    const loc = locate(focusUuid);
    const column = loc
      ? visibleColumns[loc.colIdx]
      : [...visibleColumns].reverse().find((c) => c.cards.length > 0);
    const last = column?.cards[column.cards.length - 1];
    if (last) setFocusUuid(last.uuid);
  }, [visibleColumns, focusUuid, locate]);

  const focusColumnEdge = useCallback(
    (edge: "first" | "last") => {
      const loc = locate(focusUuid);
      if (!loc) return;
      const cards = visibleColumns[loc.colIdx].cards;
      setFocusUuid(cards[edge === "first" ? 0 : cards.length - 1].uuid);
    },
    [visibleColumns, focusUuid, locate],
  );

  const moveFocus = useCallback(
    (dir: -1 | 1) => {
      const loc = locate(focusUuid);
      if (!loc) {
        focusFirst();
        return;
      }
      const cards = visibleColumns[loc.colIdx].cards;
      const next = cards[Math.max(0, Math.min(cards.length - 1, loc.rowIdx + dir))];
      setFocusUuid(next.uuid);
    },
    [focusUuid, visibleColumns, focusFirst, locate],
  );

  const moveFocusColumn = useCallback(
    (dir: -1 | 1) => {
      const loc = locate(focusUuid);
      if (!loc) {
        focusFirst();
        return;
      }
      let i = loc.colIdx + dir;
      while (i >= 0 && i < visibleColumns.length) {
        const cards = visibleColumns[i].cards;
        if (cards.length > 0) {
          setFocusUuid(cards[Math.min(loc.rowIdx, cards.length - 1)].uuid);
          return;
        }
        i += dir;
      }
    },
    [focusUuid, visibleColumns, focusFirst, locate],
  );

  const toggleSelected = useCallback((uuid: string) => {
    setSelection((sel) => {
      const next = new Set(sel);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }, []);

  /** Select every card in the focused card's column; if they are all
   * already selected, deselect them instead. */
  const selectColumn = useCallback(() => {
    const loc = locate(focusUuid);
    if (!loc) return;
    const uuids = visibleColumns[loc.colIdx].cards.map((c) => c.uuid);
    setSelection((sel) => {
      const next = new Set(sel);
      if (uuids.every((u) => next.has(u))) uuids.forEach((u) => next.delete(u));
      else uuids.forEach((u) => next.add(u));
      return next;
    });
  }, [focusUuid, visibleColumns, locate]);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const clear = useCallback(() => {
    setSelection(new Set());
    setFocusUuid(null);
    const active = document.activeElement as HTMLElement | null;
    if (active?.classList.contains("card")) active.blur();
  }, []);

  return {
    focusUuid,
    setFocusUuid,
    selection,
    setSelection,
    toggleSelected,
    selectColumn,
    clearSelection,
    focusFirst,
    focusLast,
    focusColumnEdge,
    moveFocus,
    moveFocusColumn,
    clear,
  };
}
