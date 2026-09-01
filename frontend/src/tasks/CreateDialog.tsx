import { useEffect, useRef, useState } from "react";
import type { BoardColumnDto } from "../api/types";
import { todayInputValue } from "../lib/dates";

interface Props {
  columns: BoardColumnDto[];
  initialColumn: string | null;
  onCreate: (payload: Record<string, unknown>) => Promise<boolean>;
  onClose: () => void;
}

export function CreateDialog({ columns, initialColumn, onCreate, onClose }: Props) {
  const writable = columns.filter((c) => !c.read_only);
  const [description, setDescription] = useState("");
  const [project, setProject] = useState("");
  const [tags, setTags] = useState("");
  const [priority, setPriority] = useState("");
  const [due, setDue] = useState("");
  const [columnId, setColumnId] = useState(
    initialColumn && writable.some((c) => c.id === initialColumn)
      ? initialColumn
      : (writable[0]?.id ?? ""),
  );
  const [promptValue, setPromptValue] = useState(todayInputValue(1));
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const selected = writable.find((c) => c.id === columnId);
  const needsPrompt = selected?.prompt != null;

  const submit = async () => {
    if (!description.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate({
      description: description.trim(),
      project: project.trim() || null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      priority: priority || null,
      due: due || null,
      column_id: columnId || null,
      prompt_value: needsPrompt ? promptValue : null,
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="dialog create-dialog"
        role="dialog"
        aria-label="Create task"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
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
              placeholder="home.garden"
            />
          </label>
          <label className="field">
            <span>Due</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Tags (comma separated)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
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
          <button className="btn-secondary" onClick={onClose}>
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
