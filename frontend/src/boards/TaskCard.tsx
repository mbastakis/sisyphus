import { memo, type MouseEvent } from "react";
import type { Card } from "../api/types";
import { dueLabel, dueState } from "../lib/dates";

interface Props {
  card: Card;
  /** Project of the board being viewed; the chip shows only the part below it. */
  boardProject?: string | null;
  focused?: boolean;
  selected?: boolean;
  ghost?: boolean;
  overlay?: boolean;
  landed?: boolean;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  /** Modifier-click (⌘/Ctrl/Shift) toggles selection instead of opening. */
  onToggleSelect?: () => void;
  /** The card received DOM focus (Tab, click); keeps roving focus in sync. */
  onFocus?: () => void;
}

const PRIORITY_LEVEL: Record<string, number> = { H: 3, M: 2, L: 1 };
const PRIORITY_NAME: Record<string, string> = { H: "High", M: "Medium", L: "Low" };

function projectChip(project: string | null, boardProject: string | null | undefined) {
  if (!project) return null;
  if (!boardProject) return project;
  if (project === boardProject) return null;
  if (project.startsWith(boardProject + ".")) return project.slice(boardProject.length + 1);
  return project;
}

export const TaskCard = memo(function TaskCard({
  card,
  boardProject,
  focused,
  selected,
  ghost,
  overlay,
  landed,
  onClick,
  onToggleSelect,
  onFocus,
}: Props) {
  const due = dueState(card.due);
  const prio = card.priority ? (PRIORITY_LEVEL[card.priority] ?? 0) : 0;
  const project = projectChip(card.project, boardProject);
  const classes = [
    "card",
    focused && "card-focused",
    selected && "card-selected",
    ghost && "card-ghost",
    overlay && "card-overlay",
    landed && "card-landed",
    card.active && "card-active",
    card.status === "completed" && "card-done",
  ]
    .filter(Boolean)
    .join(" ");

  const hasMeta =
    card.active || prio > 0 || card.due || project || card.blocker || card.blocked_by_open > 0;

  const label = [
    card.description,
    card.active ? "started" : null,
    card.priority ? `priority ${PRIORITY_NAME[card.priority] ?? card.priority}` : null,
    card.due ? `due ${dueLabel(card.due)}` : null,
    card.blocker ? `blocked: ${card.blocker}` : null,
    selected ? "selected" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      className={classes}
      data-uuid={card.uuid}
      onClick={(e) => {
        if (!onClick) return;
        if (onToggleSelect && (e.metaKey || e.ctrlKey || e.shiftKey)) {
          e.preventDefault();
          onToggleSelect();
          return;
        }
        onClick(e);
      }}
      onFocus={onFocus}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          e.stopPropagation();
          onClick(e as unknown as MouseEvent<HTMLDivElement>);
        }
      }}
      role={onClick ? "button" : undefined}
      aria-label={label}
      aria-pressed={onToggleSelect ? !!selected : undefined}
    >
      {selected && <span className="card-check" aria-hidden="true">✓</span>}
      <div className="card-title">{card.description}</div>
      {hasMeta && (
        <div className="card-meta">
          {card.active && (
            <span className="chip chip-active" title="Started">
              ▶
            </span>
          )}
          {prio > 0 && (
            <span
              className={`prio prio-${card.priority?.toLowerCase()}`}
              title={`Priority ${PRIORITY_NAME[card.priority ?? ""] ?? card.priority}`}
              aria-hidden="true"
            >
              <i data-on={prio >= 1} />
              <i data-on={prio >= 2} />
              <i data-on={prio >= 3} />
            </span>
          )}
          {card.due && (
            <span className={`chip chip-due due-${due} tnum`}>{dueLabel(card.due)}</span>
          )}
          {project && (
            <span className="chip-plain" title={card.project ?? undefined}>
              {project}
            </span>
          )}
          {card.blocker && <span className="chip chip-blocked" title={card.blocker}>Blocked</span>}
          {card.blocked_by_open > 0 && (
            <span className="chip chip-blocked" title={`${card.blocked_by_open} open blocker(s)`}>
              ⛓ {card.blocked_by_open}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
