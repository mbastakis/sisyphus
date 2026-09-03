import { memo } from "react";
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
  onClick?: () => void;
}

const PRIORITY_LEVEL: Record<string, number> = { H: 3, M: 2, L: 1 };

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
    card.status === "completed" && "card-done",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-uuid={card.uuid}
      onClick={onClick}
      role="button"
      aria-label={`${card.description}${card.due ? `, due ${dueLabel(card.due)}` : ""}`}
    >
      <div className="card-title">{card.description}</div>
      <div className="card-meta">
        {card.active && (
          <span className="chip chip-active" title="Started">
            ▶
          </span>
        )}
        {prio > 0 && (
          <span
            className={`prio prio-${card.priority?.toLowerCase()}`}
            title={`Priority ${card.priority}`}
            aria-label={`Priority ${card.priority}`}
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
        {card.blocked_by_open > 0 && (
          <span className="chip chip-blocked" title={`${card.blocked_by_open} open blocker(s)`}>
            ⛓ {card.blocked_by_open}
          </span>
        )}
      </div>
    </div>
  );
});
