export type DueState = "overdue" | "today" | "upcoming" | "none";

const DAY = 86400000;

let serverTimezone = "UTC";
export function configureDateTimezone(timezone: string) { serverTimezone = timezone; }
function startOfDay(d: Date): Date { return new Date(`${toDateInputValue(d.toISOString())}T00:00:00Z`); }

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
  if (diff < 7) return new Date(iso).toLocaleDateString(undefined, { timeZone: serverTimezone, weekday: "short" });
  return new Date(iso).toLocaleDateString(undefined, { timeZone: serverTimezone, day: "numeric", month: "short" });
}

export function shortDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    timeZone: serverTimezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeOnly(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { timeZone: serverTimezone, hour: "2-digit", minute: "2-digit" });
}

export function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: serverTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function todayInputValue(offsetDays = 0): string {
  return new Date(startOfDay(new Date()).getTime() + offsetDays * DAY).toISOString().slice(0, 10);
}
