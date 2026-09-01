interface Props {
  onClose: () => void;
}

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Navigate",
    rows: [
      ["G", "Focus first visible card"],
      ["J / ↓", "Next card in column"],
      ["K / ↑", "Previous card in column"],
      ["H / ←", "Nearest card in previous column"],
      ["L / →", "Nearest card in next column"],
      ["/", "Focus search"],
      ["B", "Board switcher"],
    ],
  },
  {
    title: "Act on the focused card",
    rows: [
      ["Enter", "Open task details"],
      ["E", "Edit task"],
      ["Shift+H / Shift+←", "Move to previous writable column"],
      ["Shift+L / Shift+→", "Move to next writable column"],
      ["M", "Move to…"],
      ["C", "Complete focused or selected tasks"],
      ["X", "Toggle selection"],
    ],
  },
  {
    title: "Global",
    rows: [
      ["N", "Create task"],
      ["⌘K / Ctrl+K", "Command palette"],
      ["⌘Z / U", "Undo last mutation"],
      ["Escape", "Cancel, clear selection, close overlay"],
      ["?", "This help"],
    ],
  },
];

export function KeyboardHelp({ onClose }: Props) {
  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="dialog help-dialog"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Keyboard shortcuts</h3>
        <div className="help-groups">
          {GROUPS.map((g) => (
            <div key={g.title} className="help-group">
              <h4>{g.title}</h4>
              <table>
                <tbody>
                  {g.rows.map(([key, desc]) => (
                    <tr key={key}>
                      <td>
                        <kbd>{key}</kbd>
                      </td>
                      <td>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
