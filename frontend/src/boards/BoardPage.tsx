import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { useBoard, useBoards, useSystem } from "../api/hooks";
import { useOnline } from "../api/offline";
import { knownProjects, type BoardColumnDto, type Card } from "../api/types";
import { CommandPalette } from "../components/CommandPalette";
import { KeyboardHelp } from "../components/KeyboardHelp";
import { useToast } from "../components/Toasts";
import { MoveMenu } from "../components/MoveMenu";
import { PromptDialog } from "../components/PromptDialog";
import { CreateDialog, type CreateDraft } from "../tasks/CreateDialog";
import { TaskDrawer } from "../tasks/TaskDrawer";
import { timeOnly, toDateInputValue } from "../lib/dates";
import { createDraftKey, editDraftUuids, loadDraft } from "../lib/drafts";
import { setInteractionBusy } from "../lib/idle";
import { useMedia } from "../lib/useMedia";
import { BoardColumn } from "./BoardColumn";
import { SORT_FNS } from "./sort";
import { TaskCard } from "./TaskCard";
import { TopBar } from "./TopBar";
import { useBoardActions } from "./useBoardActions";
import { collisionDetection, useBoardDnd } from "./useBoardDnd";
import { useBoardCommands } from "./useBoardCommands";
import { useBoardKeyboard } from "./useBoardKeyboard";
import { useBoardPrefs } from "./useBoardPrefs";
import { useCardFocus, type RenderColumn } from "./useCardFocus";

interface Props {
  boardId: string;
  onSelectBoard: (id: string) => void;
}

interface PendingPrompt {
  card: Card;
  toColumn: string;
  index?: number;
  field: string;
  columnName: string;
}

export function BoardPage({ boardId, onSelectBoard }: Props) {
  const toast = useToast();
  const boardsQuery = useBoards();
  const query = useBoard(boardId);
  const system = useSystem();
  const actions = useBoardActions(boardId);
  const projection = query.data;
  const isMobile = useMedia("(max-width: 768px)");
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const online = useOnline();
  const prefs = useBoardPrefs(boardId);

  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<{ uuid: string; edit: boolean } | null>(null);
  const [createIn, setCreateIn] = useState<string | null | false>(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [landedUuid, setLandedUuid] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const landedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));

  useEffect(() => {
    if (!query.isLoading) {
      setShowSkeleton(false);
      return;
    }
    const t = setTimeout(() => setShowSkeleton(true), 300);
    return () => clearTimeout(t);
  }, [query.isLoading]);

  useEffect(() => {
    setSearch("");
    setDrawer(null);
    setSortMenuOpen(false);
    // Reopen a create dialog whose draft survived a page reload.
    const draft = loadDraft<CreateDraft>(createDraftKey(boardId));
    setCreateIn(draft ? draft.columnId || null : false);
  }, [boardId]);

  const cardsByUuid = useMemo(() => {
    const m = new Map<string, Card>();
    projection?.columns.forEach((c) => c.cards.forEach((card) => m.set(card.uuid, card)));
    return m;
  }, [projection]);

  // Reopen the drawer for a task whose edit draft survived a page reload,
  // once per board load, as soon as the projection can resolve the card.
  const restoredEditFor = useRef<string | null>(null);
  useEffect(() => {
    if (!projection || restoredEditFor.current === boardId) return;
    restoredEditFor.current = boardId;
    const uuid = editDraftUuids().find((u) => cardsByUuid.has(u));
    if (uuid) setDrawer({ uuid, edit: true });
  }, [boardId, projection, cardsByUuid]);

  const filterCards = useCallback(
    (cards: Card[]) => {
      const q = search.trim().toLowerCase();
      if (!q) return cards;
      return cards.filter(
        (c) =>
          c.description.toLowerCase().includes(q) ||
          (c.project ?? "").toLowerCase().includes(q),
      );
    },
    [search],
  );

  const columnOf = useCallback(
    (uuid: string): { col: BoardColumnDto; index: number } | null => {
      if (!projection) return null;
      for (const col of projection.columns) {
        const i = col.cards.findIndex((c) => c.uuid === uuid);
        if (i >= 0) return { col, index: i };
      }
      return null;
    },
    [projection],
  );

  const markLanded = useCallback((uuid: string) => {
    if (landedTimer.current) clearTimeout(landedTimer.current);
    setLandedUuid(uuid);
    landedTimer.current = setTimeout(() => setLandedUuid(null), 750);
  }, []);

  const requestMove = useCallback(
    (card: Card, toColumn: string, index?: number) => {
      const col = projection?.columns.find((c) => c.id === toColumn);
      if (!col || col.read_only) return;
      if (col.prompt) {
        setPendingPrompt({
          card,
          toColumn,
          index,
          field: col.prompt.field,
          columnName: col.name,
        });
        return;
      }
      void actions
        .moveCard({ card, toColumn, index })
        .then((ok) => ok && markLanded(card.uuid));
    },
    [projection, actions, markLanded],
  );

  const dnd = useBoardDnd({
    projection,
    cardsByUuid,
    sortMode: prefs.sortMode,
    columnOf,
    requestMove,
    reorderCard: actions.reorderCard,
    markLanded,
  });

  const renderColumns = useMemo<RenderColumn[]>(() => {
    if (!projection) return [];
    return projection.columns.map((col) => {
      let cards: Card[];
      if (dnd.dragLists) {
        cards = (dnd.dragLists[col.id] ?? [])
          .map((u) => cardsByUuid.get(u))
          .filter((c): c is Card => c !== undefined);
      } else {
        cards = filterCards(col.cards);
        if (prefs.sortMode !== "default") {
          cards = [...cards].sort(SORT_FNS[prefs.sortMode]);
        }
      }
      return { col, cards };
    });
  }, [projection, dnd.dragLists, cardsByUuid, filterCards, prefs.sortMode]);

  const visibleColumns = useMemo(
    () => renderColumns.filter(({ col }) => isMobile || !prefs.collapsedCols.has(col.id)),
    [renderColumns, isMobile, prefs.collapsedCols],
  );

  const focus = useCardFocus(visibleColumns);

  useEffect(() => {
    focus.clear();
    // Reset roving focus and selection when switching boards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const keyboardMove = useCallback(
    (dir: -1 | 1) => {
      if (!projection || !focus.focusUuid) return;
      const loc = columnOf(focus.focusUuid);
      const card = cardsByUuid.get(focus.focusUuid);
      if (!loc || !card) return;
      const cols = projection.columns;
      let i = cols.findIndex((c) => c.id === loc.col.id) + dir;
      while (i >= 0 && i < cols.length) {
        if (!cols[i].read_only) {
          requestMove(card, cols[i].id);
          return;
        }
        i += dir;
      }
    },
    [projection, focus.focusUuid, columnOf, cardsByUuid, requestMove],
  );

  const completeFocused = useCallback(() => {
    const targets =
      focus.selection.size > 0
        ? [...focus.selection]
        : focus.focusUuid
          ? [focus.focusUuid]
          : [];
    for (const uuid of targets) {
      const card = cardsByUuid.get(uuid);
      if (card && card.status !== "completed") void actions.lifecycle(card, "complete");
    }
    focus.setSelection(new Set());
  }, [focus, cardsByUuid, actions]);

  const anyOverlayOpen =
    paletteOpen ||
    helpOpen ||
    moveMenuOpen ||
    switcherOpen ||
    sortMenuOpen ||
    pendingPrompt !== null ||
    createIn !== false ||
    drawer !== null;

  // While a dialog is open, whole-page actions (service-worker reload,
  // re-login navigation) are held back so typing is never interrupted.
  const inputBusy = createIn !== false || drawer !== null;
  useEffect(() => {
    setInteractionBusy(inputBusy);
    return () => setInteractionBusy(false);
  }, [inputBusy]);

  useBoardKeyboard(
    {
      anyOverlayOpen,
      focusUuid: focus.focusUuid,
      moveFocus: focus.moveFocus,
      moveFocusColumn: focus.moveFocusColumn,
      keyboardMove,
      completeFocused,
      focusFirst: focus.focusFirst,
      toggleSelected: focus.toggleSelected,
      clearFocus: focus.clear,
      openDrawer: (uuid, edit) => setDrawer({ uuid, edit }),
      openCreate: () => setCreateIn(null),
      openSwitcher: () => setSwitcherOpen(true),
      openMoveMenu: () => setMoveMenuOpen(true),
      openHelp: () => setHelpOpen(true),
      togglePalette: () => setPaletteOpen((v) => !v),
      closeOverlays: () => {
        setPaletteOpen(false);
        setHelpOpen(false);
        setMoveMenuOpen(false);
        setSwitcherOpen(false);
        setSortMenuOpen(false);
        setDrawer(null);
      },
      runUndo: () => void actions.runUndo(),
      clearSearch: () => setSearch(""),
    },
    searchRef,
  );

  const focusedCard = focus.focusUuid ? cardsByUuid.get(focus.focusUuid) : undefined;

  const tzMismatch = useMemo(() => {
    if (!system.data) return false;
    return system.data.utc_offset_minutes !== -new Date().getTimezoneOffset();
  }, [system.data]);

  // -- render ----------------------------------------------------------------

  const drawerCard = drawer ? cardsByUuid.get(drawer.uuid) : undefined;
  const isEmpty =
    projection && !search.trim() && projection.columns.every((c) => c.cards.length === 0);
  const boardOffline = !online || (query.isError && projection !== undefined);
  const dndEnabled = !isMobile && search.trim() === "" && !boardOffline;

  const mobileActive =
    (isMobile &&
      (prefs.mobileColumn ??
        projection?.board.mobile_default_column ??
        projection?.columns[0]?.id)) ||
    null;

  const activeCard = dnd.activeUuid ? cardsByUuid.get(dnd.activeUuid) : undefined;
  const boardProject = projection?.board.project ?? null;
  const projects = useMemo(() => knownProjects(boardsQuery.data), [boardsQuery.data]);

  const syncNow = useCallback(async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try {
      const result = await api<{ ok: boolean; detail: string | null; at: string | null }>(
        "/api/v1/sync",
        { method: "POST" },
      );
      await Promise.all([query.refetch(), boardsQuery.refetch(), system.refetch()]);
      if (result.ok) {
        toast({ message: "TaskChampion sync complete", kind: "success" });
      } else {
        toast({ message: result.detail || "TaskChampion sync failed", kind: "danger" });
      }
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : "TaskChampion sync failed",
        kind: "danger",
      });
    } finally {
      setSyncing(false);
    }
  }, [online, syncing, query, boardsQuery, system, toast]);

  const commands = useBoardCommands({
    focusedCard,
    projection,
    boards: boardsQuery.data,
    boardId,
    actions,
    columnOf,
    requestMove,
    onSelectBoard,
    openDrawer: (uuid, edit) => setDrawer({ uuid, edit }),
    syncNow: () => void syncNow(),
    syncing,
    online: !boardOffline,
    openCreate: () => setCreateIn(null),
    openHelp: () => setHelpOpen(true),
  });

  return (
    <div className="shell">
      <TopBar
        boardId={boardId}
        projection={projection}
        boards={boardsQuery.data}
        system={system.data}
        sync={projection?.sync}
        fetching={query.isFetching}
        online={!boardOffline}
        search={search}
        searchRef={searchRef}
        onSearch={setSearch}
        switcherOpen={switcherOpen}
        onToggleSwitcher={() => setSwitcherOpen((v) => !v)}
        onSelectBoard={(id) => {
          setSwitcherOpen(false);
          onSelectBoard(id);
        }}
        sortMode={prefs.sortMode}
        sortMenuOpen={sortMenuOpen}
        onToggleSortMenu={() => setSortMenuOpen((v) => !v)}
        onSelectSort={(mode) => {
          prefs.selectSort(mode);
          setSortMenuOpen(false);
        }}
        syncing={syncing}
        onSync={() => void syncNow()}
        onCreate={() => setCreateIn(null)}
        onHelp={() => setHelpOpen(true)}
      />

      {tzMismatch && system.data && (
        <div className="banner banner-warning">
          Server timezone ({system.data.server_timezone}) differs from your browser — due
          dates and Today/Overdue columns follow the server clock.
        </div>
      )}
      {boardOffline && projection && (
        <div className="banner banner-offline">
          Offline — showing data from {timeOnly(projection.generated_at)}. Changes are
          disabled until the connection returns.
        </div>
      )}

      <main className="board" role="region" aria-label="Board">
        {showSkeleton && (
          <div className="board-columns">
            {[0, 1, 2, 3].map((i) => (
              <div className="column skeleton-col" key={i}>
                <div className="skeleton skeleton-header" />
                {[0, 1, 2].map((j) => (
                  <div className="skeleton skeleton-card" key={j} />
                ))}
              </div>
            ))}
          </div>
        )}
        {query.isError && !projection && (
          <div className="board-message">
            <p>Could not load the board.</p>
            <button className="btn-primary" onClick={() => query.refetch()}>
              Retry
            </button>
          </div>
        )}
        {isEmpty && (
          <div className="board-message">
            <p>Nothing here yet.</p>
            <button className="btn-primary" onClick={() => setCreateIn(null)}>
              Create your first task — press N
            </button>
          </div>
        )}
        {projection && !isEmpty && (
          <>
            {isMobile && (
              <div className="mobile-tabs" role="tablist">
                {projection.columns.map((c) => (
                  <button
                    key={c.id}
                    role="tab"
                    aria-selected={c.id === mobileActive}
                    className={c.id === mobileActive ? "tab-active" : ""}
                    onClick={() => prefs.setMobileColumn(c.id)}
                  >
                    {c.name} <span className="tnum">{filterCards(c.cards).length}</span>
                  </button>
                ))}
              </div>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={dnd.onDragStart}
              onDragOver={dnd.onDragOver}
              onDragEnd={dnd.onDragEnd}
              onDragCancel={dnd.onDragCancel}
            >
              <div className="board-columns">
                {renderColumns
                  .filter(({ col }) => !isMobile || col.id === mobileActive)
                  .map(({ col, cards }) => (
                    <BoardColumn
                      key={col.id}
                      column={col}
                      cards={cards}
                      boardProject={boardProject}
                      dragActive={dnd.activeUuid !== null}
                      activeUuid={dnd.activeUuid}
                      focusUuid={focus.focusUuid}
                      selection={focus.selection}
                      landedUuid={landedUuid}
                      dndEnabled={dndEnabled}
                      collapsed={!isMobile && prefs.collapsedCols.has(col.id)}
                      onToggleCollapse={prefs.toggleCollapse}
                      onCardClick={(card) => {
                        focus.setFocusUuid(card.uuid);
                        setDrawer({ uuid: card.uuid, edit: false });
                      }}
                      onCreate={(columnId) => setCreateIn(columnId)}
                    />
                  ))}
              </div>
              <DragOverlay
                dropAnimation={reducedMotion ? null : { duration: 250, easing: "ease" }}
              >
                {activeCard ? (
                  <TaskCard card={activeCard} boardProject={boardProject} overlay />
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </main>

      {isMobile && (
        <nav className="bottom-bar">
          <button onClick={() => setSwitcherOpen(true)}>Boards</button>
          <button
            className="bottom-create"
            onClick={() => setCreateIn(null)}
            disabled={boardOffline}
          >
            ＋
          </button>
          <button
            onClick={() => {
              searchRef.current?.focus();
              searchRef.current?.scrollIntoView();
            }}
          >
            Search
          </button>
        </nav>
      )}

      {drawerCard && (
        <TaskDrawer
          card={drawerCard}
          actions={actions}
          projects={projects}
          initialEdit={drawer?.edit}
          onClose={() => setDrawer(null)}
        />
      )}
      {createIn !== false && projection && (
        <CreateDialog
          columns={projection.columns}
          initialColumn={createIn}
          initialProject={boardProject}
          projects={projects}
          draftKey={createDraftKey(boardId)}
          onCreate={async (payload) => (await actions.createTask(payload)) !== null}
          onClose={() => setCreateIn(false)}
        />
      )}
      {pendingPrompt && (
        <PromptDialog
          title={`Move to ${pendingPrompt.columnName}`}
          fieldLabel={`${pendingPrompt.field} date`}
          initial={
            pendingPrompt.field === "due"
              ? toDateInputValue(pendingPrompt.card.due) || undefined
              : toDateInputValue(pendingPrompt.card.wait) || undefined
          }
          onConfirm={(value) => {
            const p = pendingPrompt;
            setPendingPrompt(null);
            void actions
              .moveCard({
                card: p.card,
                toColumn: p.toColumn,
                index: p.index,
                promptValue: value,
              })
              .then((ok) => ok && markLanded(p.card.uuid));
          }}
          onCancel={() => setPendingPrompt(null)}
        />
      )}
      {moveMenuOpen && focusedCard && projection && (
        <MoveMenu
          card={focusedCard}
          columns={projection.columns}
          currentColumnId={columnOf(focusedCard.uuid)?.col.id ?? null}
          onMove={(columnId) => {
            setMoveMenuOpen(false);
            requestMove(focusedCard, columnId);
          }}
          onClose={() => setMoveMenuOpen(false)}
        />
      )}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {helpOpen && <KeyboardHelp onClose={() => setHelpOpen(false)} />}
      {(switcherOpen || sortMenuOpen) && (
        <div
          className="scrim scrim-clear"
          onClick={() => {
            setSwitcherOpen(false);
            setSortMenuOpen(false);
          }}
        />
      )}
    </div>
  );
}
