import { useId } from "react";

export function ProjectInput({ value, onChange, projects }: { value: string; onChange: (value: string) => void; projects: string[] }) {
  const id = useId();
  return <label className="field"><span>Project</span>
    <input value={value} onChange={(e) => onChange(e.target.value)} list={id} autoComplete="off" placeholder="Choose or name a project" />
    <datalist id={id}>{projects.map((p) => <option key={p} value={p} />)}</datalist>
  </label>;
}
