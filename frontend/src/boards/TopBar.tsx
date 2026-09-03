import { type RefObject } from "react";
import type { BoardSummary, Projection, SyncState, SystemInfo } from "../api/types";
import { SyncIndicator } from "../components/SyncIndicator";
import { SORT_LABELS, type SortMode } from "./sort";

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
  onSelectBoard: (id: string) => void;
  sortMode: SortMode;
  sortMenuOpen: boolean;
  onToggleSortMenu: () => void;
  onSelectSort: (mode: SortMode) => void;
  syncing: boolean;
  onSync: () => void;
  onCreate: () => void;
  onHelp: () => void;
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
  onSelectBoard,
  sortMode,
  sortMenuOpen,
  onToggleSortMenu,
  onSelectSort,
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
      >
        <span className="board-name">{projection?.board.name ?? boardId}</span>
        <span className="chevron">▾</span>
      </button>
      {switcherOpen && (
        <div className="switcher-menu" role="listbox">
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
          {(boards ?? []).some((b) => b.kind === "project") && (
            <div className="switcher-section">Projects</div>
          )}
          {(boards ?? [])
            .filter((b) => b.kind === "project")
            .map((b) => (
              <button
                key={b.id}
                role="option"
                aria-selected={b.id === boardId}
                className={`switcher-project ${b.id === boardId ? "switcher-current" : ""}`}
                title={b.project ?? b.name}
                onClick={() => onSelectBoard(b.id)}
              >
                <span className="switcher-project-row">
                  <span>{b.project ?? b.name}</span>
                  {b.open_count !== null && (
                    <small className="tnum switcher-count">{b.open_count}</small>
                  )}
                </span>
              </button>
            ))}
        </div>
      )}
      <input
        ref={searchRef}
        className="search"
        placeholder="Search  /"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        aria-label="Search tasks"
      />
      <div className="sort-control">
        <button
          className={`sort-button ${sortMode !== "default" ? "sort-active" : ""}`}
          title="Sort cards"
          aria-haspopup="listbox"
          aria-expanded={sortMenuOpen}
          onClick={onToggleSortMenu}
        >
          ⇅ {SORT_LABELS[sortMode]}
        </button>
        {sortMenuOpen && (
          <div className="switcher-menu sort-menu" role="listbox">
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
          </div>
        )}
      </div>
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
