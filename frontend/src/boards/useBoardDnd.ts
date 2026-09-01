import {
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useCallback, useState } from "react";
import type { BoardColumnDto, Card, Projection } from "../api/types";
import type { SortMode } from "./sort";

/** pointerWithin with a closestCorners fallback: closestCenter resolves to
 * the column instead of the insertion point in stacked layouts, and
 * closestCorners alone mishandles empty columns. */
export const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCorners(args);
};

interface DndDeps {
  projection: Projection | undefined;
  cardsByUuid: Map<string, Card>;
  sortMode: SortMode;
  columnOf: (uuid: string) => { col: BoardColumnDto; index: number } | null;
  requestMove: (card: Card, toColumn: string, index?: number) => void;
  reorderCard: (card: Card, index: number, fromIndex: number) => Promise<void>;
  markLanded: (uuid: string) => void;
}

/** Pointer drag state and handlers. During a drag, `dragLists` holds the
 * live per-column uuid lists so cross-column previews render before the
 * server confirms anything. */
export function useBoardDnd({
  projection,
  cardsByUuid,
  sortMode,
  columnOf,
  requestMove,
  reorderCard,
  markLanded,
}: DndDeps) {
  const [activeUuid, setActiveUuid] = useState<string | null>(null);
  const [dragLists, setDragLists] = useState<Record<string, string[]> | null>(null);

  const containerOf = (id: string, lists: Record<string, string[]>): string | null => {
    if (id.startsWith("col:")) return id.slice(4);
    for (const [cid, uuids] of Object.entries(lists)) {
      if (uuids.includes(id)) return cid;
    }
    return null;
  };

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      if (!projection) return;
      setActiveUuid(String(e.active.id));
      const lists: Record<string, string[]> = {};
      projection.columns.forEach((c) => (lists[c.id] = c.cards.map((x) => x.uuid)));
      setDragLists(lists);
    },
    [projection],
  );

  const onDragOver = useCallback(
    (e: DragOverEvent) => {
      if (!e.over || !dragLists || !projection) return;
      const activeId = String(e.active.id);
      const overId = String(e.over.id);
      const from = containerOf(activeId, dragLists);
      const to = containerOf(overId, dragLists);
      if (!from || !to || from === to) return;
      const toCol = projection.columns.find((c) => c.id === to);
      if (!toCol || toCol.read_only) return;
      setDragLists((lists) => {
        if (!lists) return lists;
        const next = { ...lists };
        next[from] = lists[from].filter((u) => u !== activeId);
        const overIdx = lists[to].indexOf(overId);
        const insertAt = overIdx >= 0 ? overIdx : lists[to].length;
        next[to] = [...lists[to].slice(0, insertAt), activeId, ...lists[to].slice(insertAt)];
        return next;
      });
    },
    [dragLists, projection],
  );

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const activeId = String(e.active.id);
      const lists = dragLists;
      setActiveUuid(null);
      setDragLists(null);
      if (!lists || !projection) return;
      const card = cardsByUuid.get(activeId);
      if (!card) return;
      const finalCol = containerOf(activeId, lists);
      let finalIdx = finalCol ? lists[finalCol].indexOf(activeId) : -1;
      if (e.over) {
        const overId = String(e.over.id);
        const overCol = containerOf(overId, lists);
        if (overCol === finalCol && !overId.startsWith("col:") && overId !== activeId) {
          finalIdx = lists[finalCol!].indexOf(overId);
        }
      }
      if (!finalCol || finalIdx < 0) return;
      const origin = columnOf(activeId);
      if (!origin) return;
      if (finalCol === origin.col.id) {
        // Same-column reorder writes ranks only when the display order IS the
        // stored order (manual board, no sort override).
        if (
          finalIdx !== origin.index &&
          projection.board.ordering_mode === "manual" &&
          sortMode === "default"
        ) {
          void reorderCard(card, finalIdx, origin.index);
          markLanded(activeId);
        }
        return;
      }
      requestMove(card, finalCol, sortMode === "default" ? finalIdx : undefined);
    },
    [dragLists, projection, cardsByUuid, sortMode, columnOf, requestMove, reorderCard, markLanded],
  );

  const onDragCancel = useCallback(() => {
    setActiveUuid(null);
    setDragLists(null);
  }, []);

  return { activeUuid, dragLists, onDragStart, onDragOver, onDragEnd, onDragCancel };
}
