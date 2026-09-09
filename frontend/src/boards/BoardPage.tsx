import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { useQuery } from "@tanstack/react-query";
import { Attention, READY_PREVIEW, TodayView, readyToStart } from "./TodayView";
import { TaskPicker } from "./TaskPicker";
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
import { configureDateTimezone, timeOnly, toDateInputValue, todayInputValue } from "../lib/dates";
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
import { cardElement, useCardFocus, type RenderColumn } from "./useCardFocus";

interface Props {
  boardId: string;
  onSelectBoard: (id: string) => void;
}

interface PendingPrompt {
  cards: Card[];
  toColumn: string;
  index?: number;
  field: string;
  columnName: string;
}

/** The Today surface has no Kanban columns; its work sections (Doing, Up
 * next, Ready to start) act as read-only pseudo-columns so J/K/H/L, S, C and
 * Enter work there too. */
function todayColumn(id: string, name: string, cards: Card[]): BoardColumnDto {
  return { id, name, read_only: true, wip_limit: null, prompt: null, count: cards.length, cards };
}

export function BoardPage({ boardId, onSelectBoard }: Props) {
  const toast = useToast();
  const boardsQuery = useBoards();
  const summary = boardsQuery.data?.find((b) => b.id === boardId);
  const [historyBoard, setHistoryBoard] = useState<string | null>(null);
  const history = historyBoard === boardId || summary?.group === "history";
  const query = useBoard(boardId, history);
  const system = useSystem();
  const actions = useBoardActions(boardId);
  const projection = query.data;
  configureDateTimezone(projection?.server_timezone ?? system.data?.server_timezone ?? "UTC");
  const isMobile = useMedia("(max-width: 768px)");
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const online = useOnline();
  const prefs = useBoardPrefs(boardId);

  const [search, setSearch] = useState("");
  const [deferredOpen, setDeferredOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ uuid: string; edit: boolean } | null>(null);
  const detail = useQuery({
    queryKey: ["task", drawer?.uuid],
    queryFn: async () => (await api<{ task: Card }>(`/api/v1/tasks/${drawer!.uuid}`)).task,
    enabled: !!drawer,
    refetchInterval: 60_000,
  });
  useEffect(() => { if (summary?.group === "history") setHistoryBoard(boardId); }, [summary?.group, boardId]);
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
    projection?.deferred?.forEach((card) => m.set(card.uuid, card));
    if (projection?.today) Object.values(projection.today).forEach((cards) => cards.forEach((card) => m.set(card.uuid, card)));
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

  /** Move one or many cards to a column. A column that asks for a value
   * (blocker, date) asks once and applies the answer to every card. */
  const requestMoveMany = useCallback(
    (cards: Card[], toColumn: string, index?: number) => {
      const col = projection?.columns.find((c) => c.id === toColumn);
      if (!col || col.read_only || cards.length === 0) return;
      if (col.prompt) {
        setPendingPrompt({
          cards,
          toColumn,
          index,
          field: col.prompt.field,
          columnName: col.name,
        });
        return;
      }
      for (const card of cards) {
        void actions
          .moveCard({ card, toColumn, index })
          .then((ok) => ok && markLanded(card.uuid));
      }
    },
    [projection, actions, markLanded],
  );

  const requestMove = useCallback(
    (card: Card, toColumn: string, index?: number) => requestMoveMany([card], toColumn, index),
    [requestMoveMany],
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

  // What the roving focus walks over: the visible Kanban columns, or the
  // Today surface's "Up next" and "Doing" sections.
  const focusColumns = useMemo<RenderColumn[]>(() => {
    if (projection?.view === "today" && projection.today) {
      const doing = filterCards(projection.today.doing);
      const chosen = filterCards(projection.today.chosen);
      const ready = filterCards(readyToStart(projection.today)).slice(0, READY_PREVIEW);
      return [
        { col: todayColumn("doing", "Doing", doing), cards: doing },
        { col: todayColumn("chosen", "Up next", chosen), cards: chosen },
        { col: todayColumn("ready", "Ready to start", ready), cards: ready },
      ];
    }
    if (isMobile) return visibleColumns.filter(({ col }) => col.id === (prefs.mobileColumn ?? projection?.board.mobile_default_column ?? projection?.columns[0]?.id));
    return visibleColumns;
  }, [projection, filterCards, isMobile, visibleColumns, prefs.mobileColumn]);

  const focus = useCardFocus(focusColumns);

  useEffect(() => {
    focus.clear();
    // Reset roving focus and selection when switching boards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  /** Cards an action applies to: the selection when there is one, else the
   * focused card. */
  const targetCards = useCallback((): Card[] => {
    const uuids = focus.selection.size > 0 ? [...focus.selection] : focus.focusUuid ? [focus.focusUuid] : [];
    return uuids.map((u) => cardsByUuid.get(u)).filter((c): c is Card => c !== undefined);
  }, [focus.selection, focus.focusUuid, cardsByUuid]);

  const keyboardMove = useCallback(
    (dir: -1 | 1) => {
      if (!projection) return;
      const cols = projection.columns;
      const groups = new Map<string, Card[]>();
      for (const card of targetCards()) {
        const loc = columnOf(card.uuid);
        if (!loc) continue;
        let i = cols.findIndex((c) => c.id === loc.col.id) + dir;
        while (i >= 0 && i < cols.length && cols[i].read_only) i += dir;
        if (i < 0 || i >= cols.length) continue;
        groups.set(cols[i].id, [...(groups.get(cols[i].id) ?? []), card]);
      }
      groups.forEach((cards, toColumn) => requestMoveMany(cards, toColumn));
      if (focus.selection.size > 0) focus.clearSelection();
    },
    [projection, targetCards, columnOf, requestMoveMany, focus],
  );

  const canReorder =
    !!projection &&
    projection.board.ordering_mode === "manual" &&
    prefs.sortMode === "default" &&
    search.trim() === "" &&
    !history &&
    projection.view !== "today";

  const keyboardReorder = useCallback(
    (dir: -1 | 1) => {
      if (!focus.focusUuid) return;
      const loc = columnOf(focus.focusUuid);
      const card = cardsByUuid.get(focus.focusUuid);
      if (!loc || !card) return;
      if (!canReorder) {
        toast({
          message:
            prefs.sortMode !== "default"
              ? "Switch sort to Board order to reorder cards"
              : "This board does not keep a manual order",
          kind: "info",
          duration: 2500,
        });
        return;
      }
      const to = loc.index + dir;
      if (to < 0 || to >= loc.col.cards.length) return;
      void actions.reorderCard(card, to, loc.index).then(() => markLanded(card.uuid));
    },
    [focus.focusUuid, columnOf, cardsByUuid, canReorder, prefs.sortMode, actions, markLanded, toast],
  );

  const completeFocused = useCallback(() => {
    const targets = targetCards().filter((c) => c.status !== "completed");
    if (targets.length === 0) return;
    // Single-card completion hands focus to the neighbour so J/C, J/C flows
    // never strand the cursor on a card that just left the column.
    if (focus.selection.size === 0 && focus.focusUuid) {
      const col = focusColumns.find(({ cards }) => cards.some((c) => c.uuid === focus.focusUuid));
      if (col) {
        const i = col.cards.findIndex((c) => c.uuid === focus.focusUuid);
        const next = col.cards[i + 1] ?? col.cards[i - 1];
        if (next) focus.setFocusUuid(next.uuid);
      }
    }
    for (const card of targets) void actions.lifecycle(card, "complete");
    focus.clearSelection();
  }, [targetCards, focus, focusColumns, actions]);

  const toggleStartFocused = useCallback(() => {
    const card = focus.focusUuid ? cardsByUuid.get(focus.focusUuid) : undefined;
    if (!card || card.status === "completed") return;
    const action = card.active ? "stop" : "start";
    if (!card.allowed_actions?.includes(action)) {
      toast({ message: card.active ? "Cannot stop this task here" : "Only Ready tasks can be started", kind: "info", duration: 2500 });
      return;
    }
    void actions.lifecycle(card, action);
  }, [focus.focusUuid, cardsByUuid, actions, toast]);

  const anyOverlayOpen =
    paletteOpen ||
    helpOpen ||
    moveMenuOpen ||
    switcherOpen ||
    sortMenuOpen ||
    pendingPrompt !== null ||
    createIn !== false ||
    drawer !== null;

  // Focus restoration: when the last overlay closes and nothing else has
  // claimed focus, put the keyboard back on the focused card.
  const wasOverlayOpen = useRef(false);
  useEffect(() => {
    if (wasOverlayOpen.current && !anyOverlayOpen && focus.focusUuid) {
      const active = document.activeElement;
      if (!active || active === document.body) {
        cardElement(focus.focusUuid)?.focus({ preventScroll: true });
      }
    }
    wasOverlayOpen.current = anyOverlayOpen;
  }, [anyOverlayOpen, focus.focusUuid]);

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
      hasSelection: focus.selection.size > 0,
      moveFocus: focus.moveFocus,
      moveFocusColumn: focus.moveFocusColumn,
      keyboardMove,
      keyboardReorder,
      completeFocused,
      toggleStartFocused,
      focusFirst: focus.focusFirst,
      focusLast: focus.focusLast,
      focusColumnEdge: focus.focusColumnEdge,
      toggleSelected: focus.toggleSelected,
      selectColumn: focus.selectColumn,
      clearSelection: focus.clearSelection,
      clearFocus: focus.clear,
      openDrawer: (uuid, edit) => setDrawer({ uuid, edit }),
      openCreate: () => setCreateIn(null),
      openSwitcher: () => setSwitcherOpen(true),
      openMoveMenu: () => setMoveMenuOpen(true),
      openSortMenu: () => setSortMenuOpen(true),
      openHelp: () => setHelpOpen(true),
      togglePalette: () => setPaletteOpen((v) => !v),
      closeOverlays: () => {
        setPaletteOpen(false);
        setHelpOpen(false);
        setMoveMenuOpen(false);
        setSwitcherOpen(false);
        setSortMenuOpen(false);
        setPendingPrompt(null);
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

  const drawerCard = drawer ? detail.data ?? cardsByUuid.get(drawer.uuid) : undefined;
  const isEmpty =
    projection && projection.view !== "today" && !search.trim() && cardsByUuid.size === 0;
  const boardOffline = !online || (query.isError && projection !== undefined);
  const dndEnabled = !history && projection?.view !== "today" && !isMobile && search.trim() === "" && !boardOffline;

  const mobileActive =
    (isMobile &&
      (prefs.mobileColumn ??
        projection?.board.mobile_default_column ??
        projection?.columns[0]?.id)) ||
    null;

  const activeCard = dnd.activeUuid ? cardsByUuid.get(dnd.activeUuid) : undefined;
  const boardProject = projection?.board.project ?? null;
  const projects = useMemo(() => knownProjects(boardsQuery.data), [boardsQuery.data]);
  const deferredCount = projection?.deferred?.length ?? 0;

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
    sortMode: prefs.sortMode,
    selectSort: prefs.selectSort,
    openDeferred: () => setDeferredOpen(true),
    deferredCount,
    collapsedCols: prefs.collapsedCols,
    toggleCollapse: prefs.toggleCollapse,
  });

  const deferredButton = projection && (
    <button
      className="btn-secondary btn-deferred"
      aria-label={`Deferred (${deferredCount})`}
      title="Tasks intentionally postponed until a later date"
      onClick={() => setDeferredOpen(true)}
    >
      Deferred <span className="count-pill tnum">{deferredCount}</span>
    </button>
  );

  const openCard = (card: Card) => {
    focus.setFocusUuid(card.uuid);
    setDrawer({ uuid: card.uuid, edit: false });
  };

  const selectionCount = focus.selection.size;

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
        onCloseSwitcher={() => setSwitcherOpen(false)}
        onSelectBoard={(id) => {
          setSwitcherOpen(false);
          onSelectBoard(id);
        }}
        sortMode={prefs.sortMode}
        sortMenuOpen={sortMenuOpen}
        onToggleSortMenu={() => setSortMenuOpen((v) => !v)}
        onCloseSortMenu={() => setSortMenuOpen(false)}
        onSelectSort={(mode) => {
          prefs.selectSort(mode);
          setSortMenuOpen(false);
        }}
        extra={!isMobile && deferredButton}
        syncing={syncing}
        onSync={() => void syncNow()}
        onCreate={() => setCreateIn(null)}
        onHelp={() => setHelpOpen(true)}
      />

      {tzMismatch && system.data && (
        <div className="banner banner-warning">
          Server timezone ({system.data.server_timezone}) differs from your browser — due
          dates and daily plans follow the server clock.
        </div>
      )}
      {boardOffline && projection && (
        <div className="banner banner-offline">
          Offline — showing data from {timeOnly(projection.generated_at)}. Changes are
          disabled until the connection returns.
        </div>
      )}

      <main className={`board ${projection?.view === "today" || history ? "board-list" : ""}`} role="region" aria-label="Board">
        {isMobile && projection && <div className="board-utilities">{deferredButton}</div>}
        {summary?.group === "later" && <p className="project-state">No committed work · This project contains backlog or deferred tasks.</p>}
        {summary?.group === "history" && <p className="project-state">No unfinished tasks. This project is now in History.</p>}
        {history && summary?.group !== "history" && <p className="project-state">History <button className="btn-secondary btn-small" onClick={() => setHistoryBoard(null)}>Show unfinished tasks</button></p>}
        {projection && !history && <Attention today={projection.today} onOpen={openCard} />}
        {projection?.view === "today" && (
          <TodayView
            today={projection.today}
            filter={filterCards}
            actions={actions}
            online={!boardOffline}
            onOpen={openCard}
            focusUuid={focus.focusUuid}
            onFocusCard={(card) => focus.setFocusUuid(card.uuid)}
          />
        )}
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
        {projection && history && <section className="history-tasks"><h2>Completed tasks</h2><div className="disclosed-tasks">{filterCards(projection.columns.flatMap((c) => c.cards)).map((card) => <div key={card.uuid}><TaskCard card={card} boardProject={boardProject} onClick={() => openCard(card)} /><small className="surface-hint">Completed {card.end ? new Date(card.end).toLocaleDateString() : ""}</small></div>)}</div></section>}
        {projection && !history && projection.view !== "today" && !isEmpty && (
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
                      onCardClick={openCard}
                      onCardFocus={(card) => focus.setFocusUuid(card.uuid)}
                      onToggleSelect={(card) => {
                        focus.setFocusUuid(card.uuid);
                        focus.toggleSelected(card.uuid);
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

      {selectionCount > 0 && !isMobile && (
        <div className="selection-bar" role="status" aria-live="polite">
          <span className="selection-count">
            <strong className="tnum">{selectionCount}</strong> selected
          </span>
          <button className="btn-secondary btn-small" onClick={completeFocused} disabled={boardOffline}>
            <kbd>C</kbd> Complete
          </button>
          <button className="btn-secondary btn-small" onClick={() => setMoveMenuOpen(true)} disabled={boardOffline}>
            <kbd>M</kbd> Move…
          </button>
          <button className="btn-secondary btn-small" onClick={focus.clearSelection}>
            <kbd>Esc</kbd> Clear
          </button>
        </div>
      )}

      {deferredOpen && projection && <TaskPicker title="Deferred tasks" cards={projection.deferred ?? []} deferred actions={actions} online={!boardOffline} onClose={() => setDeferredOpen(false)} onOpen={openCard} />}

      {isMobile && (
        <nav className="bottom-bar">
          <button onClick={() => setSwitcherOpen(true)}>Boards</button>
          <button
            className="bottom-create"
            onClick={() => setCreateIn(null)}
            disabled={boardOffline}
            aria-label="Create task"
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
          today={todayInputValue()}
          key={drawerCard.uuid}
          card={drawerCard}
          actions={actions}
          projects={projects}
          initialEdit={drawer?.edit}
          onClose={() => setDrawer(null)}
        />
      )}
      {createIn !== false && projection && (
        <CreateDialog
          today={todayInputValue()}
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
          title={`Move ${pendingPrompt.cards.length > 1 ? `${pendingPrompt.cards.length} tasks` : ""} to ${pendingPrompt.columnName}`.replace(/\s+/g, " ")}
          inputType={pendingPrompt.field === "blocker" ? "text" : "date"}
          fieldLabel={pendingPrompt.field === "blocker" ? "Blocking condition" : `${pendingPrompt.field} date`}
          initial={
            pendingPrompt.field === "blocker" ? pendingPrompt.cards[0].blocker ?? "" : pendingPrompt.field === "due"
              ? toDateInputValue(pendingPrompt.cards[0].due) || undefined
              : toDateInputValue(pendingPrompt.cards[0].wait) || undefined
          }
          onConfirm={(value) => {
            const p = pendingPrompt;
            setPendingPrompt(null);
            for (const card of p.cards) {
              void actions
                .moveCard({ card, toColumn: p.toColumn, index: p.index, promptValue: value })
                .then((ok) => ok && markLanded(card.uuid));
            }
            focus.clearSelection();
          }}
          onCancel={() => setPendingPrompt(null)}
        />
      )}
      {moveMenuOpen && focusedCard && projection && (
        <MoveMenu
          card={focusedCard}
          count={selectionCount > 0 ? selectionCount : 1}
          columns={projection.columns}
          currentColumnId={
            selectionCount > 0
              ? (() => {
                  const ids = new Set(targetCards().map((c) => columnOf(c.uuid)?.col.id));
                  return ids.size === 1 ? [...ids][0] ?? null : null;
                })()
              : columnOf(focusedCard.uuid)?.col.id ?? null
          }
          onMove={(columnId) => {
            setMoveMenuOpen(false);
            requestMoveMany(targetCards(), columnId);
            focus.clearSelection();
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
