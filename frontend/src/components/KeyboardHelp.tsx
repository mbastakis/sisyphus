import { useRef } from "react";
import { useMenuKeyboard } from "../lib/useMenuKeyboard";

interface Props {
  onClose: () => void;
}

/** Each row is a list of alternative key chords; each chord is a list of
 * keys pressed together. */
type Row = { keys: string[][]; desc: string };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Move around",
    rows: [
      { keys: [["J"], ["↓"]], desc: "Next card" },
      { keys: [["K"], ["↑"]], desc: "Previous card" },
      { keys: [["H"], ["←"]], desc: "Column to the left" },
      { keys: [["L"], ["→"]], desc: "Column to the right" },
      { keys: [["G"], ["Home"]], desc: "First card" },
      { keys: [["Shift", "G"], ["End"]], desc: "Last card" },
      { keys: [["/"]], desc: "Search, then Enter to jump to the first match" },
      { keys: [["B"]], desc: "Boards" },
      { keys: [["O"]], desc: "Sort order" },
    ],
  },
  {
    title: "Focused card",
    rows: [
      { keys: [["Enter"]], desc: "Open details" },
      { keys: [["E"]], desc: "Edit" },
      { keys: [["S"]], desc: "Start / stop" },
      { keys: [["C"]], desc: "Complete" },
      { keys: [["M"]], desc: "Move to a column (then 1–9)" },
      { keys: [["Shift", "H"], ["Shift", "←"]], desc: "Move one column left" },
      { keys: [["Shift", "L"], ["Shift", "→"]], desc: "Move one column right" },
      { keys: [["Shift", "J"], ["Shift", "↓"]], desc: "Reorder down (board order)" },
      { keys: [["Shift", "K"], ["Shift", "↑"]], desc: "Reorder up (board order)" },
    ],
  },
  {
    title: "Select many",
    rows: [
      { keys: [["X"]], desc: "Toggle selection" },
      { keys: [["Shift", "X"]], desc: "Select the whole column" },
      { keys: [["⌘", "Click"]], desc: "Toggle with the mouse" },
      { keys: [["C"], ["M"], ["Shift", "→"]], desc: "Act on every selected card" },
      { keys: [["Esc"]], desc: "Clear selection, then focus" },
    ],
  },
  {
    title: "Anywhere",
    rows: [
      { keys: [["N"]], desc: "New task" },
      { keys: [["⌘", "K"], ["Ctrl", "K"]], desc: "Command palette — type Today, then Enter to go to Today" },
      { keys: [["U"], ["⌘", "Z"]], desc: "Undo last edit or reorder" },
      { keys: [["Esc"]], desc: "Close dialog or menu" },
      { keys: [["?"]], desc: "This help" },
    ],
  },
];

function Keys({ chords }: { chords: string[][] }) {
  return (
    <span className="help-keys">
      {chords.map((chord, i) => (
        <span key={i} className="help-chord">
          {i > 0 && <span className="help-or">or</span>}
          {chord.map((k, j) => (
            <kbd key={j}>{k}</kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

export function KeyboardHelp({ onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useMenuKeyboard(ref, onClose, { initialSelector: ".help-close" });
  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={ref}
        className="dialog help-dialog"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="dialog-header">
          <h3>Keyboard shortcuts</h3>
          <button className="drawer-close help-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="help-intro">
          On column boards, press <kbd>J</kbd> or <kbd>↓</kbd> to pick up the first task.
          On Today, use <kbd>Tab</kbd> to reach tasks and direct actions. Letters
          are lower-case unless Shift is shown.
        </p>
        <div className="help-groups">
          {GROUPS.map((g) => (
            <section key={g.title} className="help-group" aria-label={g.title}>
              <h4>{g.title}</h4>
              <dl>
                {g.rows.map((r) => (
                  <div key={r.desc} className="help-row">
                    <dt>
                      <Keys chords={r.keys} />
                    </dt>
                    <dd>{r.desc}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
