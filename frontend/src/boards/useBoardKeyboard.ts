import { useEffect, useRef, type RefObject } from "react";

export interface KeyboardHandlers {
  anyOverlayOpen: boolean;
  focusUuid: string | null;
  moveFocus: (dir: -1 | 1) => void;
  moveFocusColumn: (dir: -1 | 1) => void;
  keyboardMove: (dir: -1 | 1) => void;
  completeFocused: () => void;
  focusFirst: () => void;
  toggleSelected: (uuid: string) => void;
  clearFocus: () => void;
  openDrawer: (uuid: string, edit: boolean) => void;
  openCreate: () => void;
  openSwitcher: () => void;
  openMoveMenu: () => void;
  openHelp: () => void;
  togglePalette: () => void;
  closeOverlays: () => void;
  runUndo: () => void;
  clearSearch: () => void;
}

/** Global keyboard contract (plan §9). Handlers are read through a ref so the
 * single document listener never sees stale closures. Shortcuts are
 * suppressed while typing in form controls except Escape-to-blur. */
export function useBoardKeyboard(
  handlers: KeyboardHandlers,
  searchRef: RefObject<HTMLInputElement | null>,
) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = ref.current;
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.togglePalette();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !inInput) {
        e.preventDefault();
        s.runUndo();
        return;
      }
      if (inInput) {
        if (e.key === "Escape") {
          (target as HTMLInputElement).blur();
          if (target === searchRef.current) s.clearSearch();
        }
        return;
      }
      if (s.anyOverlayOpen) {
        if (e.key === "Escape") s.closeOverlays();
        return;
      }
      if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        s.keyboardMove(e.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          s.moveFocus(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          s.moveFocus(-1);
          break;
        case "h":
        case "ArrowLeft":
          e.preventDefault();
          s.moveFocusColumn(-1);
          break;
        case "l":
        case "ArrowRight":
          e.preventDefault();
          s.moveFocusColumn(1);
          break;
        case "H":
          e.preventDefault();
          s.keyboardMove(-1);
          break;
        case "L":
          e.preventDefault();
          s.keyboardMove(1);
          break;
        case "g":
          e.preventDefault();
          s.focusFirst();
          break;
        case "Enter":
          if (s.focusUuid) {
            e.preventDefault();
            s.openDrawer(s.focusUuid, false);
          }
          break;
        case "e":
          if (s.focusUuid) {
            e.preventDefault();
            s.openDrawer(s.focusUuid, true);
          }
          break;
        case "n":
          e.preventDefault();
          s.openCreate();
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "b":
          e.preventDefault();
          s.openSwitcher();
          break;
        case "m":
          if (s.focusUuid) {
            e.preventDefault();
            s.openMoveMenu();
          }
          break;
        case "x":
          if (s.focusUuid) {
            e.preventDefault();
            s.toggleSelected(s.focusUuid);
          }
          break;
        case "c":
          e.preventDefault();
          s.completeFocused();
          break;
        case "u":
          e.preventDefault();
          s.runUndo();
          break;
        case "?":
          e.preventDefault();
          s.openHelp();
          break;
        case "Escape":
          s.clearFocus();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [searchRef]);
}
