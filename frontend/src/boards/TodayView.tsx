import type { Card, Projection } from "../api/types";
import { TaskCard } from "./TaskCard";
import { useState } from "react";
import type { BoardActions } from "./useBoardActions";
import { TaskPicker } from "./TaskPicker";
import { TaskReview } from "./TaskReview";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { ReactNode } from "react";

export function Attention({ today, onOpen }: { today: Projection["today"]; onOpen: (card: Card) => void }) {
  const [open, setOpen] = useState(false);
  if (!today) return null;
  const attention = [...new Map([...today.attention, ...today.doing, ...today.chosen].filter((c) => c.attention_reasons.length > 0).map((c) => [c.uuid, c])).values()];
  if (!attention.length && !today.unfinished_plans.length) return null;
  const unfinished = new Set(today.unfinished_plans.map((c) => c.uuid));
  return <div className="attention-area"><button className="review-trigger" onClick={() => setOpen(true)}>Needs attention <span className="count-pill tnum">{new Set([...attention, ...today.unfinished_plans].map((c) => c.uuid)).size}</span><span aria-hidden="true">↗</span></button>
    {open && <TaskReview title="Needs attention" groups={[{ title: "For review", cards: attention.filter((c) => !unfinished.has(c.uuid)) }, { title: "Unfinished daily plans", cards: today.unfinished_plans }]} onOpen={onOpen} onClose={() => setOpen(false)} />}
  </div>;
}

function DropArea({ id, label, className = "", enabled, children }: { id: string; label: string; className?: string; enabled: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !enabled });
  return <section ref={setNodeRef} aria-label={label} data-drop={id} className={`${className} today-drop ${enabled ? "drop-available" : ""} ${isOver ? "drop-over" : ""}`}>{children}</section>;
}

function DraggableTask({ card, disabled, children }: { card: Card; disabled: boolean; children: ReactNode }) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({ id: card.uuid, data: { card }, disabled });
  return <div ref={setNodeRef} className={`today-task ${isDragging ? "today-dragging" : ""}`}>
    <button ref={setActivatorNodeRef} className="today-drag-handle" aria-label={`Drag ${card.description}`} disabled={disabled} {...attributes} {...listeners}>⠿</button>{children}
  </div>;
}

/** How many Ready tasks the Today surface previews before "View all". */
export const READY_PREVIEW = 4;

/** Ready, undeferred, startable tasks that are not already chosen or in
 * progress: the pool the Today surface offers to start from. */
export function readyToStart(today: Projection["today"]): Card[] {
  return [...new Map([...today.ready_pool, ...today.attention, ...today.unfinished_plans]
    .filter((c) => c.lifecycle === "ready" && !c.deferred && c.allowed_actions.includes("start") && ![...today.chosen, ...today.doing].some((chosen) => chosen.uuid === c.uuid))
    .map((c) => [c.uuid, c])).values()];
}

interface TodayProps {
  today: Projection["today"];
  filter: (cards: Card[]) => Card[];
  onOpen: (card: Card) => void;
  actions: BoardActions;
  online: boolean;
  /** Roving keyboard focus shared with the board (J/K/H/L, S, C, Enter). */
  focusUuid?: string | null;
  onFocusCard?: (card: Card) => void;
}

export function TodayView({ today, filter, onOpen, actions, online, focusUuid = null, onFocusCard }: TodayProps) {
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [dragged, setDragged] = useState<Card | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }), useSensor(KeyboardSensor));
  const direct = async (card: Card, action: "start" | "complete") => { setBusy(card.uuid); try { await actions.lifecycle(card, action); } finally { setBusy(null); } };
  const cardProps = (card: Card) => ({ card, focused: card.uuid === focusUuid, onClick: () => onOpen(card), onFocus: () => onFocusCard?.(card) });
  const work = (list: Card[], action: "start" | "complete") => filter(list).map((card) => <DraggableTask card={card} disabled={!online || busy !== null} key={card.uuid}><TaskCard {...cardProps(card)} /><button className="btn-secondary btn-small" disabled={!online || busy !== null || !card.allowed_actions.includes(action)} onClick={() => direct(card, action)}>{busy === card.uuid ? "Saving…" : action === "start" ? "Start" : "Complete"}</button></DraggableTask>);
  const ready = readyToStart(today);
  const preview = filter(ready).slice(0, READY_PREVIEW);
  const canDrop = (action: string) => !!dragged && online && busy === null && dragged.allowed_actions.includes(action);
  return <DndContext sensors={sensors} onDragStart={({ active }) => setDragged(active.data.current?.card ?? null)} onDragCancel={() => setDragged(null)} onDragEnd={async ({ over }) => {
    const card = dragged; setDragged(null);
    if (!card || !over || !card.allowed_actions.includes(String(over.id))) return;
    const action = String(over.id);
    if ((action === "start" && today.doing.some((c) => c.uuid === card.uuid)) || (action === "up_next" && today.chosen.some((c) => c.uuid === card.uuid)) || (action === "ready_pool" && ready.some((c) => c.uuid === card.uuid))) return;
    setBusy(card.uuid); try { await actions.semantic(card, action); } finally { setBusy(null); }
  }}><div className="today-view">
    <div className="today-progress"><button className="review-trigger" onClick={() => setReview(true)}>Done today <span className="count-pill tnum">{today.done_today.length}</span><span aria-hidden="true">↗</span></button></div>
    {review && <TaskReview title="Done today" completed groups={[{ title: "Finished today", cards: today.done_today }]} onOpen={onOpen} onClose={() => setReview(false)} />}
    <div className="today-columns">
      <DropArea id="start" label="Doing" className="today-doing" enabled={canDrop("start")}><h2>Doing <small>{today.doing.length}</small></h2><p className="surface-hint">Your current work, kept here until it’s finished.</p>{work(today.doing, "complete")}{!today.doing.length && <p className="today-empty">Ready when you are. Start a task below.</p>}</DropArea>
      <DropArea id="up_next" label="Up next" className="today-next" enabled={canDrop("up_next")}><h2>Up next <small>{today.chosen.length}</small></h2>{!!today.chosen.length && <p className="surface-hint">Your optional shortlist for today.</p>}{work(today.chosen, "start")}{!today.chosen.length && <p className="surface-hint">No shortlist needed. Pull from Ready as you go.</p>}</DropArea>
    </div>
    <DropArea id="ready_pool" label="Ready to start" className="today-ready" enabled={canDrop("ready_pool")}>
      <div className="today-section-header"><h2>Ready to start <small>{ready.length}</small></h2><button className="btn-secondary btn-small" onClick={() => setPicker(true)}>Choose from Ready</button></div>
      <p className="surface-hint">Start something now, or choose it for your shortlist.</p>
      <div className="today-ready-grid">{preview.map((card) => <DraggableTask card={card} disabled={!online || busy !== null} key={card.uuid}>
        <TaskCard {...cardProps(card)} />
        <div className="today-task-actions"><button className="btn-primary btn-small" disabled={!online || busy !== null} onClick={() => direct(card, "start")}>{busy === card.uuid ? "Saving…" : "Start"}</button>
          {card.allowed_actions.includes("plan_today") && <button className="btn-secondary btn-small" disabled={!online || busy !== null} onClick={async () => { setBusy(card.uuid); try { await actions.semantic(card, "plan_today"); } finally { setBusy(null); } }}>Choose today</button>}</div>
      </DraggableTask>)}</div>
      {!preview.length && <p className="surface-hint">{ready.length ? "No Ready tasks match your search." : "Nothing else ready right now."}</p>}
      {filter(ready).length > preview.length && <button className="btn-secondary btn-small" onClick={() => setPicker(true)}>View all Ready ({ready.length})</button>}
    </DropArea>
    {picker && <TaskPicker title="Choose from Ready" cards={ready} actions={actions} online={online} onOpen={onOpen} onClose={() => setPicker(false)} />}
  </div><DragOverlay>{dragged && <TaskCard card={dragged} overlay />}</DragOverlay></DndContext>;
}
