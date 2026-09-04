/** Deferral of disruptive whole-page actions (service-worker reload,
 * auth re-login navigation) while the user has an overlay open. The board
 * reports its busy state; deferred actions run as soon as it goes idle. */

let busy = false;
const pending: Array<() => void> = [];

export function setInteractionBusy(value: boolean): void {
  busy = value;
  if (!busy) {
    while (pending.length > 0) pending.shift()?.();
  }
}

export function runWhenIdle(fn: () => void): void {
  if (busy) pending.push(fn);
  else fn();
}
