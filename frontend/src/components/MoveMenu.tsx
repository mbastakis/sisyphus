import { useEffect, useRef } from "react";
import type { BoardColumnDto, Card } from "../api/types";

interface Props {
  card: Card;
  columns: BoardColumnDto[];
  currentColumnId: string | null;
  onMove: (columnId: string) => void;
  onClose: () => void;
}

export function MoveMenu({ card, columns, currentColumnId, onMove, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
  }, []);

  const targets = columns.filter((c) => !c.read_only && c.id !== currentColumnId);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={ref}
        className="dialog move-menu"
        role="dialog"
        aria-label={`Move ${card.description}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          e.stopPropagation();
        }}
      >
        <h3>Move to</h3>
        <div className="move-menu-title">{card.description}</div>
        {targets.map((c) => (
          <button key={c.id} className="move-menu-item" onClick={() => onMove(c.id)}>
            {c.name}
            {c.prompt && <span className="move-menu-hint">asks for a date</span>}
          </button>
        ))}
        {targets.length === 0 && <div className="column-empty">No writable columns</div>}
      </div>
    </div>
  );
}
