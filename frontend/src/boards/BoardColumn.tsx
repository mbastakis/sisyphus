import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardColumnDto, Card } from "../api/types";
import { TaskCard } from "./TaskCard";

interface ColumnProps {
  column: BoardColumnDto;
  cards: Card[];
  boardProject: string | null;
  dragActive: boolean;
  activeUuid: string | null;
  focusUuid: string | null;
  selection: Set<string>;
  landedUuid: string | null;
  dndEnabled: boolean;
  collapsed: boolean;
  onToggleCollapse: (columnId: string) => void;
  onCardClick: (card: Card) => void;
  onCreate: (columnId: string) => void;
}

function SortableCard(props: {
  card: Card;
  boardProject: string | null;
  disabled: boolean;
  ghost: boolean;
  focused: boolean;
  selected: boolean;
  landed: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: props.card.uuid,
    disabled: props.disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dndProps = props.disabled ? {} : { ...attributes, ...listeners };
  return (
    <div ref={setNodeRef} style={style} {...dndProps} tabIndex={-1}>
      <TaskCard
        card={props.card}
        boardProject={props.boardProject}
        ghost={props.ghost}
        focused={props.focused}
        selected={props.selected}
        landed={props.landed}
        onClick={props.onClick}
      />
    </div>
  );
}

export function BoardColumn({
  column,
  cards,
  boardProject,
  dragActive,
  activeUuid,
  focusUuid,
  selection,
  landedUuid,
  dndEnabled,
  collapsed,
  onToggleCollapse,
  onCardClick,
  onCreate,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${column.id}`,
    disabled: column.read_only,
  });
  const wipExceeded = column.wip_limit !== null && cards.length > column.wip_limit;

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        className={[
          "column",
          "column-collapsed",
          column.read_only && dragActive && "column-rejects",
          isOver && !column.read_only && dragActive && "column-over",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={`${column.name} (collapsed)`}
      >
        <button
          className="collapsed-strip"
          title={`Expand ${column.name}`}
          onClick={() => onToggleCollapse(column.id)}
        >
          <span className="collapsed-count tnum">{cards.length}</span>
          <span className="collapsed-label">{column.name}</span>
          {column.read_only && <span className="column-lock">⌀</span>}
        </button>
      </section>
    );
  }

  const classes = [
    "column",
    column.read_only && dragActive && "column-rejects",
    isOver && !column.read_only && dragActive && "column-over",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} aria-label={column.name}>
      <header className="column-header">
        <h2>{column.name}</h2>
        {column.read_only && (
          <span className="column-lock" title="Read-only column" aria-label="Read-only">
            ⌀
          </span>
        )}
        <span className={`column-count tnum ${wipExceeded ? "wip-exceeded" : ""}`}>
          {column.wip_limit !== null ? `${cards.length} / ${column.wip_limit}` : cards.length}
        </span>
        <span className="column-spacer" />
        {!column.read_only && (
          <button
            className="column-add"
            title={`New task in ${column.name}`}
            aria-label={`New task in ${column.name}`}
            onClick={() => onCreate(column.id)}
          >
            +
          </button>
        )}
        <button
          className="column-add column-collapse-btn"
          title={`Collapse ${column.name}`}
          aria-label={`Collapse ${column.name}`}
          onClick={() => onToggleCollapse(column.id)}
        >
          −
        </button>
      </header>
      <div className="column-body" ref={setNodeRef}>
        <SortableContext
          items={cards.map((c) => c.uuid)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <SortableCard
              key={card.uuid}
              card={card}
              boardProject={boardProject}
              disabled={!dndEnabled}
              ghost={card.uuid === activeUuid}
              focused={card.uuid === focusUuid}
              selected={selection.has(card.uuid)}
              landed={card.uuid === landedUuid}
              onClick={() => onCardClick(card)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && !dragActive && <div className="column-empty">No tasks</div>}
        {cards.length === 0 && dragActive && !column.read_only && (
          <div className="column-dropzone" />
        )}
      </div>
    </section>
  );
}
