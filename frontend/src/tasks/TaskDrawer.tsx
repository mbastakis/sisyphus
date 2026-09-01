import { useEffect, useMemo, useState } from "react";
import type { Card } from "../api/types";
import type { BoardActions } from "../boards/useBoardActions";
import { shortDateTime, toDateInputValue } from "../lib/dates";

interface Props {
  card: Card;
  actions: BoardActions;
  initialEdit?: boolean;
  onClose: () => void;
}

interface Draft {
  description: string;
  project: string;
  tags: string;
  priority: string;
  due: string;
  wait: string;
  scheduled: string;
}

function toDraft(card: Card): Draft {
  return {
    description: card.description,
    project: card.project ?? "",
    tags: card.tags.join(", "),
    priority: card.priority ?? "",
    due: toDateInputValue(card.due),
    wait: toDateInputValue(card.wait),
    scheduled: toDateInputValue(card.scheduled),
  };
}

export function TaskDrawer({ card, actions, initialEdit, onClose }: Props) {
  const [editing, setEditing] = useState(initialEdit ?? false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(card));
  const [annotation, setAnnotation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(toDraft(card));
  }, [card, editing]);

  const dirty = useMemo(() => {
    const clean = toDraft(card);
    return (Object.keys(clean) as (keyof Draft)[]).some((k) => clean[k] !== draft[k]);
  }, [card, draft]);

  const close = () => {
    if (editing && dirty && !window.confirm("Discard unsaved changes?")) return;
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
    if (draft.tags !== clean.tags) {
      changes.tags = draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      prev.tags = card.tags;
    }
    for (const f of ["due", "wait", "scheduled"] as const) {
      if (draft[f] !== clean[f]) {
        changes[f] = draft[f] || null;
        prev[f] = card[f] ? toDateInputValue(card[f]) : null;
      }
    }
    if (Object.keys(changes).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const result = await actions.patchTask(card, changes, prev);
    setSaving(false);
    if (result) setEditing(false);
  };

  const addAnnotation = async () => {
    const text = annotation.trim();
    if (!text) return;
    const result = await actions.annotate(card, text);
    if (result) setAnnotation("");
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${card.description}"? This cannot be undone.`)) return;
    if (await actions.deleteTask(card)) onClose();
  };

  return (
    <aside
      className="drawer"
      role="dialog"
      aria-label={card.description}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        e.stopPropagation();
      }}
    >
      <header className="drawer-header">
        <span className={`drawer-status status-${card.status}`}>{card.status}</span>
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
              <label className="field">
                <span>Project</span>
                <input
                  value={draft.project}
                  onChange={(e) => setDraft({ ...draft, project: e.target.value })}
                />
              </label>
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
            <label className="field">
              <span>Tags (comma separated)</span>
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Due</span>
                <input
                  type="date"
                  value={draft.due}
                  onChange={(e) => setDraft({ ...draft, due: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Wait until</span>
                <input
                  type="date"
                  value={draft.wait}
                  onChange={(e) => setDraft({ ...draft, wait: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Scheduled</span>
                <input
                  type="date"
                  value={draft.scheduled}
                  onChange={(e) => setDraft({ ...draft, scheduled: e.target.value })}
                />
              </label>
            </div>
            <div className="dialog-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setDraft(toDraft(card));
                  setEditing(false);
                }}
              >
                Cancel
              </button>
              <button className="btn-primary" disabled={saving || !dirty} onClick={save}>
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
              {card.tags.length > 0 && (
                <>
                  <dt>Tags</dt>
                  <dd>{card.tags.map((t) => `#${t}`).join("  ")}</dd>
                </>
              )}
              {card.due && (
                <>
                  <dt>Due</dt>
                  <dd>{shortDateTime(card.due)}</dd>
                </>
              )}
              {card.wait && (
                <>
                  <dt>Wait until</dt>
                  <dd>{shortDateTime(card.wait)}</dd>
                </>
              )}
              {card.scheduled && (
                <>
                  <dt>Scheduled</dt>
                  <dd>{shortDateTime(card.scheduled)}</dd>
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
          </>
        )}

        <div className="drawer-actions">
          {card.status !== "completed" && (
            <button
              className="btn-secondary btn-small"
              onClick={() => actions.lifecycle(card, card.active ? "stop" : "start")}
            >
              {card.active ? "◼ Stop" : "▶ Start"}
            </button>
          )}
          {card.status === "completed" ? (
            <button
              className="btn-secondary btn-small"
              onClick={() => actions.lifecycle(card, "reopen")}
            >
              Reopen
            </button>
          ) : (
            <button
              className="btn-secondary btn-small"
              onClick={() => actions.lifecycle(card, "complete")}
            >
              ✓ Complete
            </button>
          )}
          <span className="column-spacer" />
          <button className="btn-secondary btn-small btn-danger" onClick={remove}>
            Delete
          </button>
        </div>

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
            <button className="btn-secondary btn-small" onClick={addAnnotation}>
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
            {Object.entries(card.udas).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </aside>
  );
}
