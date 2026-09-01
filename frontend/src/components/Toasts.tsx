import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "danger";
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  duration: number;
}

interface ToastInput {
  message: string;
  kind?: Toast["kind"];
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  duration?: number;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const remaining = useRef(new Map<number, number>());
  const startedAt = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    remaining.current.delete(id);
    startedAt.current.delete(id);
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, ms: number) => {
      startedAt.current.set(id, Date.now());
      remaining.current.set(id, ms);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms),
      );
    },
    [dismiss],
  );

  const push = useCallback(
    (input: ToastInput) => {
      const toast: Toast = {
        id: nextId++,
        message: input.message,
        kind: input.kind ?? "info",
        actionLabel: input.actionLabel,
        onAction: input.onAction,
        secondaryLabel: input.secondaryLabel,
        onSecondary: input.onSecondary,
        duration: input.duration ?? (input.actionLabel ? 6000 : 3500),
      };
      setToasts((ts) => [...ts.slice(-2), toast]);
      schedule(toast.id, toast.duration);
    },
    [schedule],
  );

  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t) return;
    clearTimeout(t);
    timers.current.delete(id);
    const started = startedAt.current.get(id) ?? Date.now();
    const rem = (remaining.current.get(id) ?? 0) - (Date.now() - started);
    remaining.current.set(id, Math.max(rem, 1500));
  }, []);

  const resume = useCallback(
    (id: number) => {
      if (timers.current.has(id)) return;
      if (!remaining.current.has(id)) return;
      schedule(id, remaining.current.get(id) ?? 1500);
    },
    [schedule],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
          >
            <span className="toast-message">{t.message}</span>
            {t.actionLabel && (
              <button
                className="toast-action"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
            {t.secondaryLabel && (
              <button
                className="toast-action"
                onClick={() => {
                  t.onSecondary?.();
                  dismiss(t.id);
                }}
              >
                {t.secondaryLabel}
              </button>
            )}
            <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
