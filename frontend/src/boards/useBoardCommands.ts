import { useMemo } from "react";
import type { BoardColumnDto, BoardSummary, Card, Projection } from "../api/types";
import type { Command } from "../commands/registry";
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
                section: "task",
                enabled: true,
                run: () => void actions.lifecycle(focusedCard, "stop"),
              }
            : {
                id: "start",
                name: "Start task",
                aliases: ["begin", "work on"],
                section: "task",
                enabled: true,
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
    for (const b of boards ?? []) {
      if (b.id === boardId) continue;
      list.push({
        id: `board-${b.id}`,
        name: `Go to board: ${b.name}`,
        aliases: ["switch", "open board"],
        section: "board",
        enabled: true,
        run: () => onSelectBoard(b.id),
      });
    }
    list.push({
      id: "new",
      name: "Create task",
      aliases: ["new", "add"],
      shortcut: "N",
      section: "global",
      enabled: true,
      run: openCreate,
    });
    list.push({
      id: "undo",
      name: "Undo last mutation",
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
  ]);
}
