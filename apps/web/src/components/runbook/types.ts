/** Client-safe shapes shared by the runbook editor, its three pages and their server actions (mirrors the `get_runbook` output). */
export type RunbookLevel = 'platform' | 'agency' | 'client';
export type ItemState = 'in_sync' | 'update_available' | 'new_upstream' | 'removed_upstream';

export interface RunbookItemData {
  key: string;
  kind: 'play' | 'self_rule' | 'knob';
  content: unknown;
  enabled: boolean;
  businessAreaIds: string[] | null;
  version: number;
  customised: boolean;
  upstreamVersion: number | null;
  dismissedUpstreamVersion: number | null;
  state: ItemState;
  parent: { content: unknown; version: number } | null;
}

export interface RunbookData {
  level: RunbookLevel;
  source?: 'client' | 'agency' | 'legacy';
  tailorStatus: string | null;
  items: RunbookItemData[];
  vars: string[];
  businessAreas: { id: string; name: string }[];
}

export interface Tailoring {
  title: string;
  template: string;
  businessAreaIds: string[] | null;
}

/** One write from the editor; the page's server action maps it to a runbook tool. `create` is client-level only. */
export type RunbookOp =
  | { op: 'toggle'; key: string; enabled: boolean }
  | { op: 'save'; key: string; content: unknown; businessAreaIds?: string[] | null }
  | { op: 'pull'; key: string; content?: unknown }
  | { op: 'dismiss'; key: string }
  | { op: 'add'; key: string }
  | { op: 'remove'; key: string }
  | { op: 'retailor'; key: string }
  | { op: 'create' };

export type RunbookActionResult = { ok: true; proposed?: Tailoring | null } | { ok: false; error: string };
export type RunbookAction = (op: RunbookOp) => Promise<RunbookActionResult>;
