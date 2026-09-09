export interface Annotation {
  entry: string;
  description: string;
}

export interface Card {
  lifecycle: string;
  committed: boolean;
  deferred: boolean;
  planned_for: string | null;
  deferred_until: string | null;
  blocker: string | null;
  follow_up_on: string | null;
  open_dependencies: { uuid: string; description: string }[];
  attention_reasons: string[];
  allowed_actions: string[];
  uuid: string;
  description: string;
  status: string;
  project: string | null;
  tags: string[];
  priority: string | null;
  due: string | null;
  wait: string | null;
  scheduled: string | null;
  start: string | null;
  entry: string | null;
  modified: string | null;
  end: string | null;
  urgency: number;
  active: boolean;
  annotations: Annotation[];
  depends: string[];
  blocked_by_open: number;
  rank: string | null;
  udas: Record<string, string>;
}

export interface ColumnPrompt {
  field: string;
  input: string;
}

export interface BoardColumnDto {
  id: string;
  name: string;
  read_only: boolean;
  wip_limit: number | null;
  prompt: ColumnPrompt | null;
  count: number;
  cards: Card[];
}

export interface BoardMeta {
  id: string;
  name: string;
  description: string | null;
  ordering_mode: "manual" | "computed";
  mobile_default_column: string | null;
  ready_tag: string;
  kind: "static" | "project";
  project: string | null;
}

export interface SyncState {
  status: string;
  last_success: string | null;
  detail: string | null;
}

export interface Projection {
  view: "kanban" | "today";
  today: { attention: Card[]; doing: Card[]; chosen: Card[]; unfinished_plans: Card[]; ready_pool: Card[]; done_today: Card[] };
  deferred: Card[];
  board: BoardMeta;
  generation: number;
  generated_at: string;
  server_timezone: string;
  sync: SyncState;
  unmapped: number;
  columns: BoardColumnDto[];
}

export interface BoardSummary {
  group: "active" | "later" | "history" | null;
  committed_count: number;
  unfinished_count: number;
  backlog_count: number;
  deferred_count: number;
  next_deferred_until: string | null;
  last_completed_at: string | null;
  id: string;
  name: string;
  description: string | null;
  kind: "static" | "project";
  project: string | null;
  open_count: number | null;
}

/** Project names known to the server (one dynamic board each). */
export function knownProjects(boards: BoardSummary[] | undefined): string[] {
  return (boards ?? [])
    .filter((b) => b.kind === "project" && b.project)
    .map((b) => b.project as string);
}

export interface SystemInfo {
  version: string;
  repository: string;
  config_version: number;
  server_timezone: string;
  utc_offset_minutes: number;
  sync: SyncState;
}
