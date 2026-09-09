import { useEffect, useRef, useState } from "react";
import type { Card } from "../api/types";
import type { BoardActions } from "./useBoardActions";
import { shortDateTime, dueLabel } from "../lib/dates";
import { useDialogBackdrop } from "../lib/useDialogBackdrop";

export function TaskPicker({ title, cards, actions, online, onOpen, onClose, deferred = false }: {
  title: string; cards: Card[]; actions: BoardActions; online: boolean; onOpen: (card: Card) => void; onClose: () => void; deferred?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdrop = useDialogBackdrop(onClose);
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    input.current?.focus();
    return () => { dialog.current?.close(); trigger?.focus(); };
  }, []);
  const act = async (card: Card, action: string) => {
    setBusy(card.uuid);
    try { await actions.semantic(card, action); } finally { setBusy(null); }
  };
  return <dialog ref={dialog} {...backdrop} className="dialog task-picker" aria-label={title} onCancel={(e) => { e.preventDefault(); onClose(); }} onKeyDown={(e) => e.stopPropagation()}>
    <div className="today-section-header"><h3>{title}</h3><button className="drawer-close" aria-label={`Close ${title}`} onClick={onClose}>×</button></div>
    <input ref={input} className="project-search" aria-label="Find a task" placeholder="Find a task…" value={search} onChange={(e) => setSearch(e.target.value)} />
    <div className="picker-tasks">{cards.filter((c) => `${c.description} ${c.project ?? ""}`.toLowerCase().includes(search.toLowerCase())).map((card) => <div className="picker-task" key={card.uuid}>
      <button className="picker-inspect" onClick={() => { onClose(); onOpen(card); }}>{card.description}<small>{card.project}{deferred ? ` · Returns ${shortDateTime(card.deferred_until)}` : ""}{card.due ? ` · Deadline: ${dueLabel(card.due)}` : ""}</small></button>
      <div className="drawer-actions">{(deferred ? [["return_now", "Return now"]] : [["plan_today", "Choose today"], ["start", "Start"]]).map(([action, label]) => card.allowed_actions.includes(action) && <button key={action} className="btn-secondary btn-small" disabled={!online || busy !== null} onClick={() => act(card, action)}>{busy === card.uuid ? "Saving…" : label}</button>)}</div>
    </div>)}{!cards.length && <p className="column-empty">{deferred ? "No deferred tasks." : "No more Ready tasks. You can make tasks Ready from Lifecycle."}</p>}</div>
  </dialog>;
}
