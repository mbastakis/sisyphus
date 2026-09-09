import { useRef } from "react";
import type { BoardColumnDto, Card } from "../api/types";
import { useMenuKeyboard } from "../lib/useMenuKeyboard";

interface Props {
  card: Card;
  /** Number of cards the move applies to (the focused card, or the selection). */
  count?: number;
  columns: BoardColumnDto[];
  currentColumnId: string | null;
  onMove: (columnId: string) => void;
  onClose: () => void;
}

export function MoveMenu({ card, count = 1, columns, currentColumnId, onMove, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useMenuKeyboard(ref, onClose, { hotkeys: true });

  const targets = columns.filter((c) => !c.read_only && c.id !== currentColumnId);
  const title = count > 1 ? `${count} selected tasks` : card.description;

  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={ref}
        className="dialog move-menu"
        role="dialog"
        aria-label={`Move ${title}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h3>Move to</h3>
        <div className="move-menu-title">{title}</div>
        {targets.map((c, i) => (
          <button
            key={c.id}
            className="move-menu-item"
            data-hotkey={i < 9 ? String(i + 1) : undefined}
            onClick={() => onMove(c.id)}
          >
            <span className="move-menu-name">
              {i < 9 && <kbd aria-hidden="true">{i + 1}</kbd>}
              {c.name}
            </span>
            {c.prompt && (
              <span className="move-menu-hint">
                {c.prompt.field === "blocker" ? "asks for a blocker" : "asks for a date"}
              </span>
            )}
          </button>
        ))}
        {targets.length === 0 && <div className="column-empty">No writable columns</div>}
      </div>
    </div>
  );
}
