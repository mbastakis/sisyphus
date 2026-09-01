export interface Annotation {
  entry: string;
  description: string;
}

export interface Card {
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
}

export interface SyncState {
  status: string;
  last_success: string | null;
  detail: string | null;
}

export interface Projection {
  board: BoardMeta;
  generation: number;
  generated_at: string;
  server_timezone: string;
  sync: SyncState;
  unmapped: number;
  columns: BoardColumnDto[];
}

export interface BoardSummary {
  id: string;
  name: string;
  description: string | null;
}

export interface SystemInfo {
  version: string;
  repository: string;
  config_version: number;
  server_timezone: string;
  utc_offset_minutes: number;
  sync: { status: string; last_success: string | null };
}
