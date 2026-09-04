import { useEffect, useRef, useState } from "react";
import type { BoardColumnDto } from "../api/types";
import { todayInputValue } from "../lib/dates";
import { clearDraft, loadDraft, saveDraft } from "../lib/drafts";

export interface CreateDraft {
  description: string;
  project: string;
  priority: string;
  due: string;
  columnId: string;
  promptValue: string;
}

interface Props {
  columns: BoardColumnDto[];
  initialColumn: string | null;
  /** Project of the current board, prefilled so new tasks land on it. */
  initialProject: string | null;
  /** Known project names for autocomplete; a new name creates a new board. */
  projects: string[];
  /** sessionStorage key under which the in-progress form is persisted so a
   * page reload (SW update, re-login, refresh) restores it. */
  draftKey: string;
  onCreate: (payload: Record<string, unknown>) => Promise<boolean>;
  onClose: () => void;
}

export function CreateDialog({
  columns,
  initialColumn,
  initialProject,
  projects,
  draftKey,
  onCreate,
  onClose,
}: Props) {
  const writable = columns.filter((c) => !c.read_only);
  const [restored] = useState(() => loadDraft<CreateDraft>(draftKey));
  const [description, setDescription] = useState(restored?.description ?? "");
  const [project, setProject] = useState(restored?.project ?? initialProject ?? "");
  const [priority, setPriority] = useState(restored?.priority ?? "");
  const [due, setDue] = useState(restored?.due ?? "");
  const [columnId, setColumnId] = useState(() => {
    const wanted = restored?.columnId || initialColumn;
    return wanted && writable.some((c) => c.id === wanted) ? wanted : (writable[0]?.id ?? "");
  });
  const [promptValue, setPromptValue] = useState(restored?.promptValue ?? todayInputValue(1));
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const typed = description || priority || due || project !== (initialProject ?? "");
    if (!typed) {
      clearDraft(draftKey);
      return;
    }
    saveDraft(draftKey, {
      description,
      project,
      priority,
      due,
      columnId,
      promptValue,
    } satisfies CreateDraft);
  }, [draftKey, initialProject, description, project, priority, due, columnId, promptValue]);

  const cancel = () => {
    clearDraft(draftKey);
    onClose();
  };

  const selected = writable.find((c) => c.id === columnId);
  const needsPrompt = selected?.prompt != null;

  const submit = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate({
      description: description.trim(),
      project: project.trim() || null,
      priority: priority || null,
      due: due || null,
      column_id: columnId || null,
      prompt_value: needsPrompt ? promptValue : null,
    });
    setBusy(false);
    if (ok) {
      clearDraft(draftKey);
      onClose();
    }
  };

  return (
    <div className="scrim" onClick={cancel}>
      <div
        className="dialog create-dialog"
        role="dialog"
        aria-label="Create task"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          e.stopPropagation();
        }}
      >
        <h3>New task</h3>
        <label className="field">
          <span>Description</span>
          <input
            ref={inputRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder="What needs doing?"
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Column</span>
            <select value={columnId} onChange={(e) => setColumnId(e.target.value)}>
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">None</option>
              <option value="H">High</option>
              <option value="M">Medium</option>
              <option value="L">Low</option>
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Project</span>
            <input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="e.g. home.garden"
              list="sisyphus-projects"
              autoComplete="off"
            />
            <datalist id="sisyphus-projects">
              {projects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Due</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        {needsPrompt && (
          <label className="field">
            <span>
              {selected?.name} needs a {selected?.prompt?.field} date
            </span>
            <input
              type="date"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
            />
          </label>
        )}
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={cancel}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!description.trim() || busy} onClick={submit}>
            {busy ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}
