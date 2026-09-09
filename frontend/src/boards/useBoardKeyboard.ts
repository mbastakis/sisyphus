import { useEffect, useRef, type RefObject } from "react";

export interface KeyboardHandlers {
  anyOverlayOpen: boolean;
  focusUuid: string | null;
  hasSelection: boolean;
  moveFocus: (dir: -1 | 1) => void;
  moveFocusColumn: (dir: -1 | 1) => void;
  keyboardMove: (dir: -1 | 1) => void;
  keyboardReorder: (dir: -1 | 1) => void;
  completeFocused: () => void;
  toggleStartFocused: () => void;
  focusFirst: () => void;
  focusLast: () => void;
  focusColumnEdge: (edge: "first" | "last") => void;
  toggleSelected: (uuid: string) => void;
  selectColumn: () => void;
  clearSelection: () => void;
  clearFocus: () => void;
  openDrawer: (uuid: string, edit: boolean) => void;
  openCreate: () => void;
  openSwitcher: () => void;
  openMoveMenu: () => void;
  openSortMenu: () => void;
  openHelp: () => void;
  togglePalette: () => void;
  closeOverlays: () => void;
  runUndo: () => void;
  clearSearch: () => void;
}

/** Global keyboard contract (plan §9). Handlers are read through a ref so the
 * single document listener never sees stale closures.
 *
 * Rules:
 * - Shortcuts are suppressed while typing in form controls, except Escape
 *   (blur, and clear the search box) and Enter/ArrowDown in the search box
 *   (jump to the first matching card).
 * - Any chord with ⌘/Ctrl/Alt is left to the browser (copy, address bar,
 *   new window…) except the two we own: ⌘K palette and ⌘Z undo.
 * - While an overlay is open only Escape is handled here; dialogs own the
 *   rest of their keys. */
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
      const chord = e.metaKey || e.ctrlKey;

      if (chord && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.togglePalette();
        return;
      }
      if (chord && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "z" && !inInput) {
        e.preventDefault();
        s.runUndo();
        return;
      }
      if (chord || e.altKey) return;
      // Native controls own Enter/Space and arrow keys; board shortcuts must
      // not replace their default activation with opening the focused task.
      if (target.closest("button, a, summary") && !target.closest(".card")) return;

      if (inInput) {
        if (e.key === "Escape") {
          (target as HTMLInputElement).blur();
          if (target === searchRef.current) s.clearSearch();
        } else if (
          target === searchRef.current &&
          (e.key === "Enter" || e.key === "ArrowDown")
        ) {
          // Search, then navigate: hand focus to the first matching card.
          e.preventDefault();
          target.blur();
          s.focusFirst();
        }
        return;
      }
      if (s.anyOverlayOpen) {
        if (e.key === "Escape") s.closeOverlays();
        return;
      }
      if (e.shiftKey) {
        switch (e.key) {
          case "ArrowLeft":
          case "H":
            e.preventDefault();
            s.keyboardMove(-1);
            return;
          case "ArrowRight":
          case "L":
            e.preventDefault();
            s.keyboardMove(1);
            return;
          case "ArrowUp":
          case "K":
            e.preventDefault();
            s.keyboardReorder(-1);
            return;
          case "ArrowDown":
          case "J":
            e.preventDefault();
            s.keyboardReorder(1);
            return;
          case "G":
            e.preventDefault();
            s.focusLast();
            return;
          case "X":
            e.preventDefault();
            s.selectColumn();
            return;
          case "?":
            e.preventDefault();
            s.openHelp();
            return;
        }
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
        case "g":
        case "Home":
          e.preventDefault();
          if (e.key === "Home" && s.focusUuid) s.focusColumnEdge("first");
          else s.focusFirst();
          break;
        case "End":
          e.preventDefault();
          if (s.focusUuid) s.focusColumnEdge("last");
          else s.focusLast();
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
          searchRef.current?.select();
          break;
        case "b":
          e.preventDefault();
          s.openSwitcher();
          break;
        case "o":
          e.preventDefault();
          s.openSortMenu();
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
        case "s":
          if (s.focusUuid) {
            e.preventDefault();
            s.toggleStartFocused();
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
          // Staged: drop the selection, then the focus, then the search.
          if (s.hasSelection) s.clearSelection();
          else if (s.focusUuid) s.clearFocus();
          else s.clearSearch();
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [searchRef]);
}
