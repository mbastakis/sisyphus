export type DueState = "overdue" | "today" | "upcoming" | "none";

const DAY = 86400000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dueState(iso: string | null): DueState {
  if (!iso) return "none";
  const due = startOfDay(new Date(iso)).getTime();
  const today = startOfDay(new Date()).getTime();
  if (due < today) return "overdue";
  if (due === today) return "today";
  return "upcoming";
}

export function dueLabel(iso: string | null): string {
  if (!iso) return "";
  const due = startOfDay(new Date(iso)).getTime();
  const today = startOfDay(new Date()).getTime();
  const diff = Math.round((due - today) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < -1) return `${-diff}d overdue`;
  if (diff < 7) return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function shortDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeOnly(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayInputValue(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
