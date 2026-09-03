import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api, ApiError } from "../api/client";
import type { Card, Projection } from "../api/types";
import { toDateInputValue } from "../lib/dates";
import { popUndo, pushUndo } from "../lib/undo";
import { useToast } from "../components/Toasts";

function findCard(p: Projection | undefined, uuid: string): Card | undefined {
  if (!p) return undefined;
  for (const col of p.columns) {
    const c = col.cards.find((c) => c.uuid === uuid);
    if (c) return c;
  }
  return undefined;
}

function locateCard(
  p: Projection | undefined,
  uuid: string,
): { columnId: string; index: number } | null {
  if (!p) return null;
  for (const col of p.columns) {
    const i = col.cards.findIndex((c) => c.uuid === uuid);
    if (i >= 0) return { columnId: col.id, index: i };
  }
  return null;
}

function moveInProjection(
  p: Projection,
  uuid: string,
  toColumn: string | null,
  index: number | null,
  patch?: Partial<Card>,
): Projection {
  let moved: Card | undefined;
  const columns = p.columns.map((col) => {
    const i = col.cards.findIndex((c) => c.uuid === uuid);
    if (i < 0) return col;
    moved = col.cards[i];
    const cards = col.cards.slice();
    cards.splice(i, 1);
    return { ...col, cards, count: cards.length };
  });
  if (moved && patch) moved = { ...moved, ...patch };
  if (moved && toColumn) {
    const target = columns.findIndex((c) => c.id === toColumn);
    if (target >= 0) {
      const col = columns[target];
      const cards = col.cards.slice();
      const at = index === null ? cards.length : Math.min(index, cards.length);
      cards.splice(at, 0, moved);
      columns[target] = { ...col, cards, count: cards.length };
    }
  }
  return { ...p, columns };
}

export interface MoveRequest {
  card: Card;
  toColumn: string;
  index?: number;
  promptValue?: string;
  recordUndo?: boolean;
}

export function useBoardActions(boardId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["board", boardId];

  // Offline is read-only (plan §9): block mutations at the source so no
  // queued change is ever presented as saved.
  const offlineGuard = useCallback((): boolean => {
    if (navigator.onLine) return false;
    toast({ message: "Offline — mutations are disabled", kind: "info", duration: 3000 });
    return true;
  }, [toast]);

  const getProjection = useCallback(
    () => qc.getQueryData<Projection>(key),
    [qc, boardId],
  );

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: key });
    // Project boards come and go with the tasks in them.
    qc.invalidateQueries({ queryKey: ["boards"] });
  }, [qc, boardId]);

  const conflictToast = useCallback(
    (err: ApiError, retry: (freshModified: string) => void) => {
      toast({
        message: "This task changed elsewhere.",
        kind: "danger",
        actionLabel: "Reload",
        onAction: refresh,
        secondaryLabel: err.task ? "Overwrite" : undefined,
        onSecondary: err.task
          ? () => retry(err.task!.modified ?? "")
          : undefined,
      });
    },
    [toast, refresh],
  );

  const failToast = useCallback(
    (err: unknown, retry?: () => void) => {
      const message =
        err instanceof ApiError ? err.message : "Request failed — is the backend running?";
      toast({
        message,
        kind: "danger",
        actionLabel: retry ? "Retry" : undefined,
        onAction: retry,
      });
    },
    [toast],
  );

  const moveCard = useCallback(
    async (req: MoveRequest): Promise<boolean> => {
      if (offlineGuard()) return false;
      const before = getProjection();
      const origin = locateCard(before, req.card.uuid);
      const originCard = findCard(before, req.card.uuid) ?? req.card;
      if (before) {
        qc.setQueryData(
          key,
          moveInProjection(before, req.card.uuid, req.toColumn, req.index ?? null),
        );
      }
      const attempt = async (expected: string) => {
        const res = await api<{ task: Card }>(
          `/api/v1/boards/${boardId}/tasks/${req.card.uuid}/move`,
          {
            method: "POST",
            body: {
              to_column: req.toColumn,
              expected_modified: expected,
              prompt_value: req.promptValue ?? null,
              index: req.index ?? null,
            },
          },
        );
        return res.task;
      };
      try {
        await attempt(req.card.modified ?? "");
        if (req.recordUndo !== false && origin && origin.columnId !== req.toColumn) {
          const prevDue = originCard.due;
          const prevWait = originCard.wait;
          pushUndo({
            label: `Move back to ${origin.columnId}`,
            run: async () => {
              const current = findCard(getProjection(), req.card.uuid);
              if (!current) throw new Error("task no longer visible");
              const sourcePrompt = getProjection()?.columns.find(
                (c) => c.id === origin.columnId,
              )?.prompt;
              let promptValue: string | undefined;
              if (sourcePrompt?.field === "due" && prevDue)
                promptValue = toDateInputValue(prevDue);
              if (sourcePrompt?.field === "wait" && prevWait)
                promptValue = toDateInputValue(prevWait);
              await moveCard({
                card: current,
                toColumn: origin.columnId,
                index: origin.index,
                promptValue,
                recordUndo: false,
              });
            },
          });
          const colName =
            before?.columns.find((c) => c.id === req.toColumn)?.name ?? req.toColumn;
          toast({
            message: `Moved to ${colName}`,
            kind: "success",
            actionLabel: "Undo",
            onAction: () => runUndo(),
          });
        }
        return true;
      } catch (err) {
        qc.setQueryData(key, before);
        if (err instanceof ApiError && err.status === 409) {
          conflictToast(err, (fresh) => {
            void moveCard({ ...req, card: { ...req.card, modified: fresh } });
          });
        } else {
          failToast(err, () => void moveCard(req));
        }
        return false;
      } finally {
        refresh();
      }
    },
    [boardId, qc, getProjection, conflictToast, failToast, refresh, toast, offlineGuard],
  );

  const reorderCard = useCallback(
    async (card: Card, index: number, fromIndex: number) => {
      if (offlineGuard()) return;
      const before = getProjection();
      const origin = locateCard(before, card.uuid);
      if (before && origin) {
        qc.setQueryData(key, moveInProjection(before, card.uuid, origin.columnId, index));
      }
      try {
        await api(`/api/v1/boards/${boardId}/tasks/${card.uuid}/reorder`, {
          method: "POST",
          body: { index, expected_modified: card.modified ?? "" },
        });
        pushUndo({
          label: "Restore order",
          run: async () => {
            const current = findCard(getProjection(), card.uuid);
            if (!current) throw new Error("task no longer visible");
            await reorderCard(current, fromIndex, index);
          },
        });
      } catch (err) {
        qc.setQueryData(key, before);
        if (err instanceof ApiError && err.status === 409) {
          conflictToast(err, (fresh) => {
            void reorderCard({ ...card, modified: fresh }, index, fromIndex);
          });
        } else {
          failToast(err);
        }
      } finally {
        refresh();
      }
    },
    [boardId, qc, getProjection, conflictToast, failToast, refresh, offlineGuard],
  );

  const lifecycle = useCallback(
    async (
      card: Card,
      action: "complete" | "reopen" | "start" | "stop",
      opts: { recordUndo?: boolean; silent?: boolean } = {},
    ) => {
      if (offlineGuard()) return;
      const before = getProjection();
      if (before && action === "complete") {
        const hasDone = before.columns.some((c) => c.id === "done");
        qc.setQueryData(
          key,
          moveInProjection(before, card.uuid, hasDone ? "done" : null, 0, {
            status: "completed",
            active: false,
          }),
        );
      }
      try {
        await api(`/api/v1/tasks/${card.uuid}/${action}`, {
          method: "POST",
          body: { expected_modified: card.modified ?? "" },
        });
        if (opts.recordUndo !== false) {
          const inverse: Record<string, "complete" | "reopen" | "start" | "stop"> = {
            complete: "reopen",
            reopen: "complete",
            start: "stop",
            stop: "start",
          };
          pushUndo({
            label: `Undo ${action}`,
            run: async () => {
              const current =
                findCard(getProjection(), card.uuid) ?? { ...card, modified: "" };
              await lifecycle(current as Card, inverse[action], {
                recordUndo: false,
                silent: true,
              });
            },
          });
          if (!opts.silent) {
            const labels: Record<string, string> = {
              complete: "Task completed",
              reopen: "Task reopened",
              start: "Task started",
              stop: "Task stopped",
            };
            toast({
              message: labels[action],
              kind: "success",
              actionLabel: "Undo",
              onAction: () => runUndo(),
            });
          }
        }
      } catch (err) {
        qc.setQueryData(key, before);
        if (err instanceof ApiError && err.status === 409) {
          conflictToast(err, (fresh) => {
            void lifecycle({ ...card, modified: fresh }, action, opts);
          });
        } else {
          failToast(err);
        }
      } finally {
        refresh();
      }
    },
    [qc, getProjection, conflictToast, failToast, refresh, toast, offlineGuard],
  );

  const patchTask = useCallback(
    async (
      card: Card,
      changes: Record<string, unknown>,
      prev: Record<string, unknown>,
      opts: { recordUndo?: boolean } = {},
    ): Promise<Card | null> => {
      if (offlineGuard()) return null;
      try {
        const res = await api<{ task: Card }>(`/api/v1/tasks/${card.uuid}`, {
          method: "PATCH",
          body: { expected_modified: card.modified ?? "", set: changes },
        });
        if (opts.recordUndo !== false && Object.keys(prev).length > 0) {
          pushUndo({
            label: "Undo edit",
            run: async () => {
              const current = findCard(getProjection(), card.uuid) ?? res.task;
              await patchTask(current, prev, {}, { recordUndo: false });
            },
          });
        }
        refresh();
        return res.task;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          conflictToast(err, (fresh) => {
            void patchTask({ ...card, modified: fresh }, changes, prev, opts);
          });
        } else {
          failToast(err);
        }
        return null;
      }
    },
    [getProjection, conflictToast, failToast, refresh, offlineGuard],
  );

  const createTask = useCallback(
    async (payload: Record<string, unknown>): Promise<Card | null> => {
      if (offlineGuard()) return null;
      try {
        const res = await api<{ task: Card }>(`/api/v1/boards/${boardId}/tasks`, {
          method: "POST",
          body: payload,
        });
        toast({ message: "Task created", kind: "success" });
        refresh();
        return res.task;
      } catch (err) {
        failToast(err);
        return null;
      }
    },
    [boardId, toast, refresh, failToast, offlineGuard],
  );

  const deleteTask = useCallback(
    async (card: Card): Promise<boolean> => {
      if (offlineGuard()) return false;
      try {
        await api(`/api/v1/tasks/${card.uuid}/delete`, {
          method: "POST",
          body: { expected_modified: card.modified ?? "" },
        });
        toast({ message: "Task deleted", kind: "info" });
        refresh();
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          conflictToast(err, (fresh) => {
            void deleteTask({ ...card, modified: fresh });
          });
        } else {
          failToast(err);
        }
        return false;
      }
    },
    [toast, refresh, conflictToast, failToast, offlineGuard],
  );

  const annotate = useCallback(
    async (card: Card, text: string): Promise<Card | null> => {
      if (offlineGuard()) return null;
      try {
        const res = await api<{ task: Card }>(`/api/v1/tasks/${card.uuid}/annotations`, {
          method: "POST",
          body: { description: text },
        });
        refresh();
        return res.task;
      } catch (err) {
        failToast(err);
        return null;
      }
    },
    [refresh, failToast, offlineGuard],
  );

  const runUndo = useCallback(async () => {
    const entry = popUndo();
    if (!entry) {
      toast({ message: "Nothing to undo", kind: "info", duration: 2000 });
      return;
    }
    try {
      await entry.run();
      toast({ message: "Undone", kind: "info", duration: 2000 });
    } catch (err) {
      failToast(err);
      refresh();
    }
  }, [toast, failToast, refresh]);

  return {
    moveCard,
    reorderCard,
    lifecycle,
    patchTask,
    createTask,
    deleteTask,
    annotate,
    runUndo,
    refresh,
    getProjection,
  };
}

export type BoardActions = ReturnType<typeof useBoardActions>;
