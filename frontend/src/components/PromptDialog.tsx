import { useEffect, useRef, useState } from "react";
import { todayInputValue } from "../lib/dates";

interface Props {
  title: string;
  fieldLabel: string;
  initial?: string;
  inputType?: "text" | "date";
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({ title, fieldLabel, initial, inputType = "date", onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(initial ?? (inputType === "date" ? todayInputValue(1) : ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (value) onConfirm(value);
  };

  return (
    <div className="scrim" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
          e.stopPropagation();
        }}
      >
        <h3>{title}</h3>
        {inputType === "date" && <div className="quick-dates">
          <button onClick={() => onConfirm(todayInputValue(0))}>Today</button>
          <button onClick={() => onConfirm(todayInputValue(1))}>Tomorrow</button>
          <button onClick={() => onConfirm(todayInputValue(7))}>Next week</button>
        </div>}
        <label className="field">
          <span>{fieldLabel}</span>
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            {inputType === "date" ? "Set date" : "Set blocker"}
          </button>
        </div>
      </div>
    </div>
  );
}
