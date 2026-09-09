import { useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "../api/types";
import type { BoardActions } from "../boards/useBoardActions";
import { shortDateTime, toDateInputValue } from "../lib/dates";
import { clearDraft, editDraftKey, loadDraft, saveDraft } from "../lib/drafts";
import { ProjectInput } from "./ProjectInput";
import { useOnline } from "../api/offline";

interface Props {
  card: Card;
  actions: BoardActions;
  /** Known project names for autocomplete. */
  projects: string[];
  today: string;
  initialEdit?: boolean;
  onClose: () => void;
}

interface Draft {
  description: string;
  project: string;
  priority: string;
  due: string;
}

function toDraft(card: Card): Draft {
  return {
    description: card.description,
    project: card.project ?? "",
    priority: card.priority ?? "",
    due: toDateInputValue(card.due),
  };
}

interface StoredEdit {
  draft: Draft;
  annotation: string;
  editing?: boolean;
  semantic?: {
    operation: "block" | "follow_up" | "defer";
    condition: string;
    date: string;
    initial: { condition: string; date: string };
  };
}

export function TaskDrawer({ card, actions, projects, today, initialEdit, onClose }: Props) {
  const drawerRef = useRef<HTMLElement>(null);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    if (!drawerRef.current?.contains(document.activeElement)) {
      drawerRef.current?.querySelector<HTMLButtonElement>(".drawer-close")?.focus();
    }
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [opener]);
  const draftKey = editDraftKey(card.uuid);
  // A pending edit persisted before a page reload reopens straight into
  // edit mode with the typed values intact.
  const [restored] = useState(() => loadDraft<StoredEdit>(draftKey));
  const [editing, setEditing] = useState(restored?.editing ?? ((initialEdit ?? false) || restored !== undefined));
  useEffect(() => {
    if (!editing && document.activeElement === document.body) {
      drawerRef.current?.querySelector<HTMLButtonElement>(".drawer-close")?.focus();
    }
  }, [editing]);
  const [draft, setDraft] = useState<Draft>(() => restored?.draft ?? toDraft(card));
  const [annotation, setAnnotation] = useState(restored?.annotation ?? "");
  const [saving, setSaving] = useState(false);
  const online = useOnline();
  const [operation, setOperation] = useState<"block" | "follow_up" | "defer" | null>(restored?.semantic?.operation ?? null);
  const [condition, setCondition] = useState(restored?.semantic?.condition ?? "");
  const [date, setDate] = useState(restored?.semantic?.date ?? "");
  const [semanticInitial, setSemanticInitial] = useState(restored?.semantic?.initial ?? { condition: "", date: "" });
  const beginOperation = (next: "block" | "follow_up" | "defer") => {
    const initial = { condition: next === "block" ? card.blocker ?? "" : "", date: next === "follow_up" ? card.follow_up_on ?? "" : "" };
    setSemanticInitial(initial);
    setCondition(initial.condition);
    setDate(initial.date);
    setOperation(next);
  };
  const allowed = (action: string) => card.allowed_actions?.includes(action);
  const act = async (action: string, fields: { date?: string; blocker?: string } = {}) => {
    setSaving(true);
    const ok = await actions.semantic(card, action, fields);
    setSaving(false);
    if (ok) { setOperation(null); setDate(""); setCondition(""); }
    return ok;
  };

  // A background refetch replaces `card`; only follow it while not editing so
  // in-progress edits are never overwritten by the server copy.
  useEffect(() => {
    if (!editing) setDraft(toDraft(card));
  }, [card, editing]);

  useEffect(() => {
    if (editing || annotation || operation) saveDraft(draftKey, {
      draft, annotation, editing,
      semantic: operation ? { operation, condition, date, initial: semanticInitial } : undefined,
    } satisfies StoredEdit);
    else clearDraft(draftKey);
  }, [draftKey, editing, draft, annotation, operation, condition, date, semanticInitial]);

  const dirty = useMemo(() => {
    const clean = toDraft(card);
    return (Object.keys(clean) as (keyof Draft)[]).some((k) => clean[k] !== draft[k]);
  }, [card, draft]);

  const close = () => {
    const semanticDirty = operation !== null && (condition !== semanticInitial.condition || date !== semanticInitial.date);
    if (((editing && dirty) || annotation !== "" || semanticDirty) && !window.confirm("Discard unsaved changes?")) return;
    clearDraft(draftKey);
    onClose();
  };

  const save = async () => {
    const clean = toDraft(card);
    const changes: Record<string, unknown> = {};
    const prev: Record<string, unknown> = {};
    if (draft.description !== clean.description) {
      changes.description = draft.description;
      prev.description = card.description;
    }
    if (draft.project !== clean.project) {
      changes.project = draft.project || null;
      prev.project = card.project;
    }
    if (draft.priority !== clean.priority) {
      changes.priority = draft.priority || null;
      prev.priority = card.priority;
    }
    for (const f of ["due"] as const) {
      if (draft[f] !== clean[f]) {
        changes[f] = draft[f] || null;
        prev[f] = card[f] ? toDateInputValue(card[f]) : null;
      }
    }
    if (Object.keys(changes).length === 0) {
      clearDraft(draftKey);
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await actions.patchTask(card, changes, prev);
    setSaving(false);
    if (result) {
      clearDraft(draftKey);
      setEditing(false);
    }
  };

  const addAnnotation = async () => {
    const text = annotation.trim();
    if (!text) return;
    const result = await actions.annotate(card, text);
    if (result) setAnnotation("");
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${card.description}"? No undo is available in Sisyphus.`)) return;
    if (await actions.deleteTask(card)) {
      clearDraft(draftKey);
      onClose();
    }
  };

  return (
    <>
    <div
      className="drawer-backdrop"
      aria-hidden="true"
      onPointerDown={(e) => e.preventDefault()}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    />
    <aside
      ref={drawerRef}
      className="drawer"
      role="dialog"
      aria-label={card.description}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) close();
        e.stopPropagation();
      }}
    >
      <header className="drawer-header">
        <span className={`drawer-status status-${card.status}`}>{card.deferred ? "Deferred" : card.lifecycle}</span>
        {card.active && <span className="chip chip-active">▶ started</span>}
        <span className="column-spacer" />
        {!editing && (
          <button className="btn-secondary btn-small" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <button className="drawer-close" aria-label="Close" onClick={close}>
          ×
        </button>
      </header>

      <div className="drawer-body">
        {editing ? (
          <div className="task-form">
            <label className="field">
              <span>Description</span>
              <textarea
                rows={2}
                value={draft.description}
                autoFocus
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <div className="field-row">
              <ProjectInput value={draft.project} onChange={(project) => setDraft({ ...draft, project })} projects={projects} />
              <label className="field">
                <span>Priority</span>
                <select
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
                >
                  <option value="">None</option>
                  <option value="H">High</option>
                  <option value="M">Medium</option>
                  <option value="L">Low</option>
                </select>
              </label>
            </div>
            <div className="field-row">
              <label className="field">
                <span>Deadline</span>
                <input
                  type="date"
                  value={draft.due}
                  onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                />
              </label>
            </div>
            <div className="dialog-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  clearDraft(draftKey);
                  setDraft(toDraft(card));
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <button className="btn-primary" disabled={!online || saving || !dirty} onClick={save}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="drawer-title">{card.description}</h2>
            <dl className="drawer-fields">
              {card.project && (
                <>
                  <dt>Project</dt>
                  <dd>{card.project}</dd>
                </>
              )}
              {card.priority && (
                <>
                  <dt>Priority</dt>
                  <dd>{{ H: "High", M: "Medium", L: "Low" }[card.priority]}</dd>
                </>
              )}
              {card.due && (
                <>
                  <dt>Due</dt>
                  <dd>{shortDateTime(card.due)}</dd>
                </>
              )}
              {card.deferred_until && card.deferred && (
                <>
                  <dt>Deferred until</dt>
                  <dd>{shortDateTime(card.deferred_until)}</dd>
                </>
              )}
              {card.planned_for && (
                <>
                  <dt>Planned for</dt>
                  <dd>{card.planned_for}</dd>
                </>
              )}
              {card.blocked_by_open > 0 && (
                <>
                  <dt>Blocked</dt>
                  <dd className="text-danger">
                    ⛓ {card.blocked_by_open} open blocker{card.blocked_by_open > 1 ? "s" : ""}
                  </dd>
                </>
              )}
            </dl>
            {card.blocker && <p className="blocker-condition">Blocked: {card.blocker}</p>}
            {card.follow_up_on && <p className="muted">Follow up {card.follow_up_on}</p>}
            {!!card.open_dependencies?.length && <section><h4>Open prerequisites</h4><ul>{card.open_dependencies.map((d) => <li key={d.uuid}>{d.description}</li>)}</ul></section>}
          </>
        )}

        <fieldset className="semantic-actions" disabled={!online || saving}>
        <div className="drawer-actions">
          {(allowed("start") || allowed("stop")) && (
            <button
              className="btn-secondary btn-small"
              onClick={() => actions.lifecycle(card, card.active ? "stop" : "start")}
            >
              {card.lifecycle === "doing" ? "Return to Ready" : "▶ Start"}
            </button>
          )}
          {allowed("reopen") ? (
            <button
              className="btn-secondary btn-small"
              onClick={() => actions.lifecycle(card, "reopen")}
            >
              Reopen
            </button>
          ) : allowed("complete") ? (
            <button
              className="btn-secondary btn-small"
              onClick={() => actions.lifecycle(card, "complete")}
            >
              ✓ Complete
            </button>
          ) : null}
          {card.lifecycle === "backlog" && allowed("ready") && <button className="btn-secondary btn-small" onClick={() => act("ready")}>Make ready</button>}
          {card.lifecycle !== "doing" && card.planned_for !== today && allowed("plan_today") && <button className="btn-secondary btn-small" onClick={() => act("plan_today")}>Plan today</button>}
          {card.planned_for && allowed("clear_plan") && <button className="btn-secondary btn-small" onClick={() => act("clear_plan")}>Clear plan</button>}
          {card.blocker && allowed("clear_blocker") && <button className="btn-secondary btn-small" onClick={() => act("clear_blocker")}>Resolve blocker</button>}
          {allowed("return_now") && <button className="btn-secondary btn-small" onClick={() => act("return_now")}>Return now</button>}
          {(card.blocker || card.open_dependencies.length > 0) && allowed("follow_up") && <button className="btn-secondary btn-small" onClick={() => beginOperation("follow_up")}>Review blocker</button>}
        </div>
        {(card.committed && allowed("backlog") || allowed("block") || allowed("defer")) && <div className="drawer-actions" role="group" aria-label="Change commitment or availability">
          {card.committed && allowed("backlog") && <button className="btn-secondary btn-small" onClick={() => act("backlog")}>Return to backlog</button>}
          {([['block', 'Block'], ['defer', 'Defer']] as const).map(([action, label]) => allowed(action) &&
            <button key={action} className="btn-secondary btn-small" onClick={() => beginOperation(action)}>{label}</button>)}
        </div>}
        {operation && <div className="task-form semantic-form">
          {operation === "block" && <label className="field"><span>Blocking condition</span><input autoFocus value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="What must happen before this can continue?" /></label>}
          {operation === "follow_up" && <p>{card.blocker || "Review the open prerequisites."} The task stays blocked until the condition clears.</p>}
          <label className="field"><span>{operation === "defer" ? "Return date" : "Follow-up date (optional)"}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          {operation === "follow_up" && date && <button className="btn-secondary btn-small" onClick={() => setDate("")}>Clear follow-up date</button>}
          <div className="dialog-actions"><button className="btn-secondary" onClick={() => setOperation(null)}>Cancel</button>
            <button className="btn-primary" disabled={operation === "block" ? !condition.trim() : operation === "defer" && !date}
              onClick={() => act(operation, { ...(date ? { date } : {}), ...(operation === "block" ? { blocker: condition.trim() } : {}) })}>Save</button></div>
        </div>}
        <div className="drawer-danger-actions">
          <button className="btn-secondary btn-small btn-danger" onClick={remove}>Delete</button>
        </div>
        </fieldset>

        <section className="drawer-section">
          <h4>Annotations</h4>
          {card.annotations.length === 0 && <div className="column-empty">None yet</div>}
          {card.annotations.map((a, i) => (
            <div key={i} className="annotation">
              <div className="annotation-date tnum">{shortDateTime(a.entry)}</div>
              <div>{a.description}</div>
            </div>
          ))}
          <div className="annotation-add">
            <input
              placeholder="Add a note…"
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addAnnotation();
              }}
            />
            <button className="btn-secondary btn-small" disabled={!online || saving || !annotation.trim()} onClick={addAnnotation}>
              Add
            </button>
          </div>
        </section>

        <details className="drawer-raw">
          <summary>Raw details</summary>
          <dl className="drawer-fields mono">
            <dt>uuid</dt>
            <dd>{card.uuid}</dd>
            <dt>status</dt>
            <dd>{card.status}</dd>
            <dt>urgency</dt>
            <dd className="tnum">{card.urgency.toFixed(2)}</dd>
            <dt>entry</dt>
            <dd>{shortDateTime(card.entry)}</dd>
            <dt>modified</dt>
            <dd>{shortDateTime(card.modified)}</dd>
            {card.start && (
              <>
                <dt>start</dt>
                <dd>{shortDateTime(card.start)}</dd>
              </>
            )}
            {card.end && (
              <>
                <dt>end</dt>
                <dd>{shortDateTime(card.end)}</dd>
              </>
            )}
            {card.depends.length > 0 && (
              <>
                <dt>depends</dt>
                <dd>{card.depends.join(", ")}</dd>
              </>
            )}
          </dl>
        </details>
      </div>
    </aside>
    </>
  );
}
