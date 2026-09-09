import { useEffect, useRef, useState } from "react";
import type { Card } from "../api/types";
import { shortDateTime } from "../lib/dates";
import { useDialogBackdrop } from "../lib/useDialogBackdrop";

export function TaskReview({ title, groups, completed = false, onOpen, onClose }: {
  title: string; groups: { title: string; cards: Card[] }[]; completed?: boolean;
  onOpen: (card: Card) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdrop = useDialogBackdrop(onClose);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={dialog} {...backdrop} className="dialog task-picker task-review" aria-label={title}
    onCancel={(e) => { e.preventDefault(); onClose(); }} onKeyDown={(e) => e.stopPropagation()}>
    <div className="today-section-header"><h3>{title}</h3><button className="drawer-close" aria-label={`Close ${title}`} onClick={onClose}>×</button></div>
    <input className="project-search" autoFocus aria-label="Find a task" placeholder="Find a task…" value={search} onChange={(e) => setSearch(e.target.value)} />
    {groups.map((group) => <section key={group.title} aria-label={group.title}><h4>{group.title}</h4>
      {group.cards.filter((card) => `${card.description} ${card.project ?? ""}`.toLowerCase().includes(search.toLowerCase())).map((card) =>
        <button className="review-task" key={card.uuid} onClick={() => { onClose(); onOpen(card); }}>
          <span>{card.description}</span><small>{card.project || "No project"}</small>
          <small>{completed ? `Completed ${shortDateTime(card.end)}` : [card.blocker, ...card.attention_reasons.map((r) => r.replaceAll("_", " ")), card.planned_for ? `Planned ${card.planned_for}` : null].filter(Boolean).join(" · ")}</small>
        </button>)}
      {!group.cards.length && <p className="surface-hint">Nothing here yet.</p>}
    </section>)}
  </dialog>;
}
