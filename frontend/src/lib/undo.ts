export interface UndoEntry {
  label: string;
  run: () => Promise<void>;
}

const MAX_DEPTH = 20;
const stack: UndoEntry[] = [];

export function pushUndo(entry: UndoEntry): void {
  stack.push(entry);
  if (stack.length > MAX_DEPTH) stack.shift();
}

export function popUndo(): UndoEntry | undefined {
  return stack.pop();
}

export function undoDepth(): number {
  return stack.length;
}
