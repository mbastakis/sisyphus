import { useRef, type PointerEvent } from "react";

export function useDialogBackdrop(onClose: () => void) {
  const startedOutside = useRef(false);
  const outside = (event: PointerEvent<HTMLDialogElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  };
  return {
    onPointerDown: (event: PointerEvent<HTMLDialogElement>) => { startedOutside.current = outside(event); },
    onPointerUp: (event: PointerEvent<HTMLDialogElement>) => {
      if (startedOutside.current && outside(event)) onClose();
      startedOutside.current = false;
    },
    onPointerCancel: () => { startedOutside.current = false; },
  };
}
