import { useMemo } from "react";
import type { BoardColumnDto, BoardSummary, Card, Projection } from "../api/types";
import type { Command } from "../commands/registry";
import { SORT_LABELS, type SortMode } from "./sort";
import type { BoardActions } from "./useBoardActions";

interface CommandDeps {
  focusedCard: Card | undefined;
  projection: Projection | undefined;
  boards: BoardSummary[] | undefined;
  boardId: string;
  actions: BoardActions;
  columnOf: (uuid: string) => { col: BoardColumnDto; index: number } | null;
  requestMove: (card: Card, toColumn: string) => void;
  onSelectBoard: (id: string) => void;
  openDrawer: (uuid: string, edit: boolean) => void;
  syncNow: () => void;
  syncing: boolean;
  online: boolean;
  openCreate: () => void;
  openHelp: () => void;
  sortMode: SortMode;
  selectSort: (mode: SortMode) => void;
  openDeferred: () => void;
  deferredCount: number;
  collapsedCols: Set<string>;
  toggleCollapse: (columnId: string) => void;
}

/** Context-aware command palette registry: focused-card actions first, then
 * board switching, then globals. One source of truth with the shortcut help. */
export function useBoardCommands({
  focusedCard,
  projection,
  boards,
  boardId,
  actions,
  columnOf,
  requestMove,
  onSelectBoard,
  openDrawer,
  syncNow,
  syncing,
  online,
  openCreate,
  openHelp,
  sortMode,
  selectSort,
  openDeferred,
  deferredCount,
  collapsedCols,
  toggleCollapse,
}: CommandDeps): Command[] {
  return useMemo(() => {
    const list: Command[] = [];
    if (focusedCard && projection) {
      const loc = columnOf(focusedCard.uuid);
      list.push({
        id: "open",
        name: "Open task details",
        aliases: ["view", "show"],
        shortcut: "↵",
        section: "task",
        enabled: true,
        run: () => openDrawer(focusedCard.uuid, false),
      });
      list.push({
        id: "edit",
        name: "Edit task",
        aliases: ["change", "modify"],
        shortcut: "E",
        section: "task",
        enabled: true,
        run: () => openDrawer(focusedCard.uuid, true),
      });
      if (focusedCard.status !== "completed") {
        list.push({
          id: "complete",
          name: "Complete task",
          aliases: ["finish", "done", "close"],
          shortcut: "C",
          section: "task",
          enabled: true,
          run: () => void actions.lifecycle(focusedCard, "complete"),
        });
        list.push(
          focusedCard.active
            ? {
                id: "stop",
                name: "Stop task",
                aliases: ["pause"],
                shortcut: "S",
                section: "task",
                enabled: online && !!focusedCard.allowed_actions?.includes("stop"),
                run: () => void actions.lifecycle(focusedCard, "stop"),
              }
            : {
                id: "start",
                name: "Start task",
                aliases: ["begin", "work on"],
                shortcut: "S",
                section: "task",
                enabled: online && !!focusedCard.allowed_actions?.includes("start"),
                run: () => void actions.lifecycle(focusedCard, "start"),
              },
        );
      } else {
        list.push({
          id: "reopen",
          name: "Reopen task",
          aliases: ["undone", "restore"],
          section: "task",
          enabled: true,
          run: () => void actions.lifecycle(focusedCard, "reopen"),
        });
      }
      for (const col of projection.columns) {
        if (col.read_only || col.id === loc?.col.id) continue;
        list.push({
          id: `move-${col.id}`,
          name: `Move to ${col.name}`,
          aliases: ["send to " + col.name.toLowerCase()],
          section: "task",
          enabled: true,
          run: () => requestMove(focusedCard, col.id),
        });
      }
    }
    list.push({
      id: "board-daily",
      name: "Go to Today",
      aliases: ["daily", "open today"],
      section: "board",
      enabled: true,
      run: () => onSelectBoard("daily"),
    });
    for (const b of boards ?? []) {
      if (b.id === boardId || b.id === "daily") continue;
      list.push({
        id: `board-${b.id}`,
        name: `Go to board: ${b.name}`,
        aliases: ["switch", "open board"],
        section: "board",
        enabled: true,
        run: () => onSelectBoard(b.id),
      });
    }
    if (projection && projection.view !== "today") {
      for (const mode of Object.keys(SORT_LABELS) as SortMode[]) {
        if (mode === sortMode) continue;
        list.push({
          id: `sort-${mode}`,
          name: `Sort by ${SORT_LABELS[mode].toLowerCase()}`,
          aliases: ["order", "sort"],
          section: "board",
          enabled: true,
          run: () => selectSort(mode),
        });
      }
      for (const col of projection.columns) {
        const collapsed = collapsedCols.has(col.id);
        list.push({
          id: `collapse-${col.id}`,
          name: `${collapsed ? "Expand" : "Collapse"} column: ${col.name}`,
          aliases: [collapsed ? "show column" : "hide column"],
          section: "board",
          enabled: true,
          run: () => toggleCollapse(col.id),
        });
      }
    }
    list.push({
      id: "deferred",
      name: `Show deferred tasks (${deferredCount})`,
      aliases: ["postponed", "later", "snoozed"],
      section: "board",
      enabled: !!projection,
      run: openDeferred,
    });
    list.push({
      id: "new",
      name: "Create task",
      aliases: ["new", "add"],
      shortcut: "N",
      section: "global",
      enabled: online,
      run: openCreate,
    });
    list.push({
      id: "undo",
      name: "Undo last edit or reorder",
      aliases: ["revert"],
      shortcut: "⌘Z",
      section: "global",
      enabled: true,
      run: () => void actions.runUndo(),
    });
    list.push({
      id: "sync",
      name: syncing ? "Syncing with TaskChampion…" : "Sync with TaskChampion",
      aliases: ["sync", "refresh", "full sync", "taskchampion"],
      section: "global",
      enabled: online && !syncing,
      run: syncNow,
    });
    list.push({
      id: "help",
      name: "Keyboard shortcuts",
      aliases: ["help", "keys"],
      shortcut: "?",
      section: "global",
      enabled: true,
      run: openHelp,
    });
    return list;
  }, [
    focusedCard,
    projection,
    boards,
    boardId,
    actions,
    columnOf,
    requestMove,
    onSelectBoard,
    openDrawer,
    syncNow,
    syncing,
    online,
    openCreate,
    openHelp,
    sortMode,
    selectSort,
    openDeferred,
    deferredCount,
    collapsedCols,
    toggleCollapse,
  ]);
}
