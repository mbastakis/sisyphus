export interface Command {
  id: string;
  name: string;
  aliases: string[];
  shortcut?: string;
  section: "task" | "board" | "global";
  enabled: boolean;
  run: () => void;
}

export interface CommandMatch {
  command: Command;
  matchedAlias: string | null;
  score: number;
}

function subsequenceScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q) - (t.length - q.length) * 0.1;
  let qi = 0;
  let score = 50;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
    } else {
      score -= 0.5;
    }
  }
  return qi === q.length ? score : -1;
}

export function matchCommands(commands: Command[], query: string): CommandMatch[] {
  const q = query.trim();
  if (!q) {
    return commands
      .filter((c) => c.enabled)
      .map((c) => ({ command: c, matchedAlias: null, score: 0 }));
  }
  const out: CommandMatch[] = [];
  for (const c of commands) {
    if (!c.enabled) continue;
    let best = subsequenceScore(q, c.name);
    let alias: string | null = null;
    for (const a of c.aliases) {
      const s = subsequenceScore(q, a);
      if (s > best) {
        best = s;
        alias = a;
      }
    }
    if (best >= 0) out.push({ command: c, matchedAlias: alias, score: best });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
