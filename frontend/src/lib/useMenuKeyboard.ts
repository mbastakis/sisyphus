import { useEffect, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [role="option"]:not([disabled]), input:not([disabled]), [tabindex="0"]';

function items(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null,
  );
}

/** Arrow-key navigation for popover menus and small dialogs.
 *
 * - ArrowUp/ArrowDown move through the focusable items (wrapping);
 *   Home/End jump to the ends.
 * - Escape calls `onClose`.
 * - On mount, focus goes to the element matching `initialSelector`, else the
 *   first item, so a menu opened from the keyboard is usable at once.
 * - Typing a digit 1–9 activates the item with that `data-hotkey`, when
 *   `hotkeys` is set.
 *
 * Keys are stopped from bubbling so the board's global shortcuts stay quiet
 * while the menu is open. */
export function useMenuKeyboard(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: { initialSelector?: string; hotkeys?: boolean; restoreFocus?: boolean } = {},
) {
  const { initialSelector, hotkeys = false, restoreFocus = true } = options;

  useEffect(() => {
    const root = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    const initial =
      (initialSelector && root?.querySelector<HTMLElement>(initialSelector)) || items(root)[0];
    initial?.focus({ preventScroll: true });
    return () => {
      if (restoreFocus && trigger && document.contains(trigger)) trigger.focus();
    };
    // Mount only: the menu is remounted every time it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (e: KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    const list = items(ref.current);
    const idx = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      list[(i + list.length) % list.length]?.focus();
    };
    switch (e.key) {
      case "ArrowDown":
        go(idx + 1);
        break;
      case "ArrowUp":
        go(idx - 1);
        break;
      case "Home":
        if (!typing) go(0);
        break;
      case "End":
        if (!typing) go(list.length - 1);
        break;
      default:
        if (hotkeys && !typing && /^[1-9]$/.test(e.key)) {
          const hit = ref.current?.querySelector<HTMLElement>(`[data-hotkey="${e.key}"]`);
          if (hit) {
            e.preventDefault();
            hit.click();
          }
        }
    }
    e.stopPropagation();
  };
}
