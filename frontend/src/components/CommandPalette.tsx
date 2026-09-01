import { useEffect, useMemo, useRef, useState } from "react";
import { matchCommands, type Command } from "../commands/registry";

interface Props {
  commands: Command[];
  onClose: () => void;
}

const SECTION_ORDER: Record<string, number> = { task: 0, board: 1, global: 2 };
const SECTION_LABEL: Record<string, string> = {
  task: "Focused task",
  board: "Boards",
  global: "Global",
};

export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const m = matchCommands(commands, query);
    if (!query.trim()) {
      m.sort(
        (a, b) => SECTION_ORDER[a.command.section] - SECTION_ORDER[b.command.section],
      );
    }
    return m.slice(0, 12);
  }, [commands, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const run = (i: number) => {
    const m = matches[i];
    if (!m) return;
    onClose();
    m.command.run();
  };

  let lastSection = "";

  return (
    <div className="scrim scrim-top" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, matches.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter") run(index);
          e.stopPropagation();
        }}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Command"
        />
        <div className="palette-list" ref={listRef}>
          {matches.map((m, i) => {
            const showSection = !query.trim() && m.command.section !== lastSection;
            lastSection = m.command.section;
            return (
              <div key={m.command.id}>
                {showSection && (
                  <div className="palette-section">{SECTION_LABEL[m.command.section]}</div>
                )}
                <button
                  data-idx={i}
                  className={`palette-item ${i === index ? "palette-item-active" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(i)}
                >
                  <span className="palette-name">
                    {m.command.name}
                    {m.matchedAlias && (
                      <span className="palette-alias">{m.matchedAlias}</span>
                    )}
                  </span>
                  {m.command.shortcut && (
                    <kbd className="palette-kbd">{m.command.shortcut}</kbd>
                  )}
                </button>
              </div>
            );
          })}
          {matches.length === 0 && <div className="column-empty">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}
