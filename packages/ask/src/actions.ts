import type { ASK_WRITE_TOOLS } from '@cs/tools';

export type AskWriteTool = (typeof ASK_WRITE_TOOLS)[number];

/** A write the model proposed (e8). Code runs it only when the user confirms. */
export type AskAction = {
  tool: AskWriteTool;
  input: unknown;
  summary: string;
  state: 'proposed' | 'confirmed' | 'cancelled' | 'failed';
  error?: string;
};

const VERDICT: Record<string, string> = { useful: 'useful', not_relevant: 'not relevant', wrong: 'wrong' };
const STATUS: Record<string, string> = { todo: 'to do', in_progress: 'in progress', done: 'done', dismissed: 'dismissed' };
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const clip = (s: string, n = 120): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The fixed per-tool confirm-card summary for a validated write input. */
export function actionSummary(tool: AskWriteTool, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (tool) {
    case 'add_recommendation':
      return `Save recommendation: "${clip(str(i.title).replace(/"/g, "'"))}"`;
    case 'update_recommendation_status':
      return `Mark recommendation as ${STATUS[str(i.status)] ?? str(i.status)}`;
    case 'submit_feedback':
      return `Rate this change as ${VERDICT[str(i.verdict)] ?? str(i.verdict)}`;
  }
}
