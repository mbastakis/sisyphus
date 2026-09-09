import { useEffect, useState } from "react";
import type { BoardColumnDto } from "../api/types";
import { clearDraft, loadDraft, saveDraft } from "../lib/drafts";
import { ProjectInput } from "./ProjectInput";
import { useOnline } from "../api/offline";

export interface CreateDraft {
  description: string; project: string; priority: string; due: string;
  columnId: string; today: boolean; context: string;
}
interface Props {
  columns: BoardColumnDto[]; initialColumn: string | null; initialProject: string | null;
  projects: string[]; draftKey: string; today: string;
  onCreate: (payload: Record<string, unknown>) => Promise<boolean>; onClose: () => void;
}
export function CreateDialog({ initialColumn, initialProject, projects, draftKey, today, onCreate, onClose }: Props) {
  const online = useOnline();
  const [draft, setDraft] = useState<CreateDraft>(() => {
    const restored = loadDraft<Partial<CreateDraft>>(draftKey);
    const text = (key: keyof CreateDraft, fallback = "") => typeof restored?.[key] === "string" ? restored[key] as string : fallback;
    const column = text("columnId", initialColumn ?? "backlog");
    return {
      description: text("description"), project: text("project", initialProject ?? ""),
      priority: ["H", "M", "L"].includes(text("priority")) ? text("priority") : "", due: text("due"),
      columnId: column === "ready" ? "ready" : "backlog",
      today: restored?.today === true, context: text("context"),
    };
  });
  const [busy, setBusy] = useState(false);
  const set = (changes: Partial<CreateDraft>) => setDraft((d) => ({ ...d, ...changes }));
  useEffect(() => { if (draft.description || draft.context) saveDraft(draftKey, draft); }, [draftKey, draft]);
  const cancel = () => { clearDraft(draftKey); onClose(); };
  const submit = async () => {
    if (!draft.description.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate({ description: draft.description.trim(), project: draft.project.trim() || null,
      priority: draft.priority || null, due: draft.due || null,
      column_id: draft.today ? "ready" : draft.columnId,
      planned_for: draft.today ? today : null,
      annotations: draft.context.trim() ? [draft.context.trim()] : [],
    });
    setBusy(false);
    if (ok) cancel();
  };
  return <div className="scrim" onClick={cancel}><div className="dialog create-dialog" role="dialog" aria-label="Create task"
    onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
      if (e.key === "Escape") cancel();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
      e.stopPropagation();
    }}>
    <h3>New task</h3>
    <label className="field"><span>Title</span><input autoFocus value={draft.description} placeholder="What needs doing?"
      onChange={(e) => set({ description: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} /></label>
    <ProjectInput value={draft.project} onChange={(project) => set({ project })} projects={projects} />
    <div className="field-row creation-intent">
      <label><input type="checkbox" checked={draft.columnId === "ready" || draft.today} disabled={draft.today}
        onChange={(e) => set({ columnId: e.target.checked ? "ready" : "backlog" })} /> Ready</label>
      <label><input type="checkbox" checked={draft.today} onChange={(e) => set({ today: e.target.checked })} /> Today</label>
      <small>Backlog unless you choose to commit.</small>
    </div>
    <details className="creation-advanced"><summary>More details</summary>
      <div className="field-row">
        <label className="field"><span>Deadline</span><input type="date" value={draft.due} onChange={(e) => set({ due: e.target.value })} /></label>
        <label className="field"><span>Priority</span><select value={draft.priority} onChange={(e) => set({ priority: e.target.value })}>
          <option value="">None</option><option value="H">High</option><option value="M">Medium</option><option value="L">Low</option>
        </select></label>
      </div>
      <label className="field"><span>Context</span><textarea value={draft.context} onChange={(e) => set({ context: e.target.value })} placeholder="Notes, links, or completion criteria" /></label>
    </details>
    <div className="dialog-actions"><button className="btn-secondary" onClick={cancel}>Cancel</button>
      <button className="btn-primary" disabled={!online || !draft.description.trim() || busy} onClick={submit}>{busy ? "Creating…" : "Create task"}</button></div>
  </div></div>;
}
