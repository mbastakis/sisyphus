import type { Card } from "../api/types";

/** Device-local display sort. Never writes ranks: while a non-default sort is
 * active, same-column drag reordering is disabled and cross-column drops omit
 * the index, so stored manual order is never corrupted by a temporary view. */
export type SortMode = "default" | "urgency" | "priority" | "due" | "newest" | "oldest";

export const SORT_LABELS: Record<SortMode, string> = {
  default: "Board order",
  urgency: "Urgency",
  priority: "Priority",
  due: "Due date",
  newest: "Newest",
  oldest: "Oldest",
};

const PRIORITY_ORDER: Record<string, number> = { H: 0, M: 1, L: 2 };

export const SORT_FNS: Record<Exclude<SortMode, "default">, (a: Card, b: Card) => number> = {
  urgency: (a, b) => b.urgency - a.urgency,
  priority: (a, b) => {
    const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3;
    const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3;
    return pa - pb || b.urgency - a.urgency;
  },
  due: (a, b) => {
    if (!a.due && !b.due) return b.urgency - a.urgency;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return a.due.localeCompare(b.due);
  },
  newest: (a, b) => (b.entry ?? "").localeCompare(a.entry ?? ""),
  oldest: (a, b) => (a.entry ?? "").localeCompare(b.entry ?? ""),
};

export function isSortMode(value: string | null): value is SortMode {
  return value !== null && value in SORT_LABELS;
}
