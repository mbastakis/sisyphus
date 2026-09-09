import { useRef, type ReactNode, type RefObject } from "react";
import type { BoardSummary, Projection, SyncState, SystemInfo } from "../api/types";
import { SyncIndicator } from "../components/SyncIndicator";
import { useMenuKeyboard } from "../lib/useMenuKeyboard";
import { SORT_LABELS, type SortMode } from "./sort";
import { ProjectNavigation } from "./ProjectNavigation";

interface TopBarProps {
  boardId: string;
  projection: Projection | undefined;
  boards: BoardSummary[] | undefined;
  system: SystemInfo | undefined;
  sync: SyncState | undefined;
  fetching: boolean;
  online: boolean;
  search: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onSearch: (value: string) => void;
  switcherOpen: boolean;
  onToggleSwitcher: () => void;
  onCloseSwitcher: () => void;
  onSelectBoard: (id: string) => void;
  sortMode: SortMode;
  sortMenuOpen: boolean;
  onToggleSortMenu: () => void;
  onCloseSortMenu: () => void;
  onSelectSort: (mode: SortMode) => void;
  /** Rendered after the sort control on desktop (e.g. the Deferred button). */
  extra?: ReactNode;
  syncing: boolean;
  onSync: () => void;
  onCreate: () => void;
  onHelp: () => void;
}

/** A popover menu that takes keyboard focus when it opens and gives it back
 * to its trigger when it closes. */
function Menu({
  className,
  label,
  onClose,
  initialSelector,
  children,
}: {
  className: string;
  label: string;
  onClose: () => void;
  initialSelector?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useMenuKeyboard(ref, onClose, { initialSelector });
  return (
    <div ref={ref} className={className} role="listbox" aria-label={label} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

export function TopBar({
  boardId,
  projection,
  boards,
  system,
  sync,
  fetching,
  online,
  search,
  searchRef,
  onSearch,
  switcherOpen,
  onToggleSwitcher,
  onCloseSwitcher,
  onSelectBoard,
  sortMode,
  sortMenuOpen,
  onToggleSortMenu,
  onCloseSortMenu,
  onSelectSort,
  extra,
  syncing,
  onSync,
  onCreate,
  onHelp,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button
        className="board-switcher"
        onClick={onToggleSwitcher}
        aria-haspopup="listbox"
        aria-expanded={switcherOpen}
        title="Switch board (B)"
      >
        <span className="board-name">{projection?.board.name ?? boardId}</span>
        <span className="chevron">▾</span>
      </button>
      {switcherOpen && (
        <Menu
          className="switcher-menu"
          label="Boards"
          onClose={onCloseSwitcher}
          initialSelector=".switcher-current"
        >
          {(boards ?? [])
            .filter((b) => b.kind !== "project")
            .map((b) => (
              <button
                key={b.id}
                role="option"
                aria-selected={b.id === boardId}
                className={b.id === boardId ? "switcher-current" : ""}
                onClick={() => onSelectBoard(b.id)}
              >
                <span>{b.name}</span>
                {b.description && <small>{b.description}</small>}
              </button>
            ))}
          <ProjectNavigation boards={boards ?? []} boardId={boardId} onSelect={onSelectBoard} />
        </Menu>
      )}
      <label className="search-wrap">
        <input
          ref={searchRef}
          className="search"
          type="search"
          placeholder="Search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search tasks"
          aria-keyshortcuts="/"
          autoComplete="off"
        />
        {!search && <kbd className="search-hint" aria-hidden="true">/</kbd>}
      </label>
      <div className="sort-control">
        <button
          className={`sort-button ${sortMode !== "default" ? "sort-active" : ""}`}
          title="Sort cards (O)"
          aria-haspopup="listbox"
          aria-expanded={sortMenuOpen}
          onClick={onToggleSortMenu}
        >
          <span aria-hidden="true">⇅</span> {SORT_LABELS[sortMode]}
        </button>
        {sortMenuOpen && (
          <Menu
            className="switcher-menu sort-menu"
            label="Sort cards"
            onClose={onCloseSortMenu}
            initialSelector=".switcher-current"
          >
            {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
              <button
                key={mode}
                role="option"
                aria-selected={mode === sortMode}
                className={mode === sortMode ? "switcher-current" : ""}
                onClick={() => onSelectSort(mode)}
              >
                <span>
                  {SORT_LABELS[mode]}
                  {mode === "default" &&
                    projection?.board.ordering_mode === "manual" &&
                    " (manual)"}
                </span>
              </button>
            ))}
          </Menu>
        )}
      </div>
      {extra}
      <span className="column-spacer" />
      {system?.repository === "fake" && (
        <span
          className="fake-badge"
          title="In-memory fake data — your real Taskwarrior is untouched"
        >
          FAKE DATA
        </span>
      )}
      <SyncIndicator
        sync={sync}
        fetching={fetching}
        online={online}
        degraded={sync?.status === "degraded"}
      />
      <button
        className={`btn-icon sync-button ${syncing ? "sync-button-active" : ""}`}
        title={online ? "Sync with TaskChampion now" : "Offline — sync unavailable"}
        aria-label="Sync with TaskChampion now"
        onClick={onSync}
        disabled={!online || syncing}
      >
        ↻
      </button>
      <button
        className="btn-primary topbar-create"
        onClick={onCreate}
        disabled={!online}
        title={online ? "Create task (N)" : "Offline — mutations disabled"}
      >
        + New
      </button>
      <button
        className="btn-icon"
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
        onClick={onHelp}
      >
        ?
      </button>
    </header>
  );
}
