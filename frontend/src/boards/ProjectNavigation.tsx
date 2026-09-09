import { useState } from "react";
import type { BoardSummary } from "../api/types";
import { shortDateTime } from "../lib/dates";

export function ProjectNavigation({ boards, boardId, onSelect }: { boards: BoardSummary[]; boardId: string; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState(false);
  const projects = boards.filter((b) => b.kind === "project");
  const row = (b: BoardSummary, label = false) => <button key={b.id} role="option" aria-selected={b.id === boardId}
    className={`switcher-project ${b.id === boardId ? "switcher-current" : ""}`} onClick={() => onSelect(b.id)}>
    <span className="switcher-project-row"><span>{b.project ?? b.name}</span>
      <small title={b.group === "active" ? "Committed unfinished tasks: Ready, Doing, and Waiting; excludes deferred tasks" : undefined}>
        {label && `${b.group} · `}{b.group === "active" ? b.committed_count : b.group === "history" ? shortDateTime(b.last_completed_at) : `${b.backlog_count} backlog${b.deferred_count ? ` · ${b.deferred_count} deferred${b.next_deferred_until ? ` until ${shortDateTime(b.next_deferred_until)}` : ""}` : ""}`}
      </small></span></button>;
  return <>
    <input className="project-search" aria-label="Search projects" placeholder="Search all projects…" value={search} onChange={(e) => setSearch(e.target.value)} />
    {search.trim() ? projects.filter((b) => (b.project ?? b.name).toLowerCase().includes(search.trim().toLowerCase())).map((b) => row(b, true)) : history ? <>
      <button onClick={() => setHistory(false)}>← Active projects</button>
      <div className="switcher-section">History · no unfinished tasks</div>
      {projects.filter((b) => b.group === "history").sort((a, b) => (b.last_completed_at ?? "").localeCompare(a.last_completed_at ?? "")).map((b) => row(b))}
    </> : <>
      <div className="switcher-section">Active projects</div>
      {projects.filter((b) => b.group === "active").map((b) => row(b))}
      {projects.some((b) => b.group === "later") && <details className="project-later"><summary>Later ({projects.filter((b) => b.group === "later").length})</summary>{projects.filter((b) => b.group === "later").map((b) => row(b))}</details>}
      <button onClick={() => setHistory(true)}>Browse history</button>
    </>}
  </>;
}
