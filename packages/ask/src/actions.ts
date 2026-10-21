import { ASK_WRITE_TOOLS } from '@cs/tools';

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

/** Write tools whose input schema carries `clientId` (test-checked against the real schemas). */
const CLIENT_ID_TOOLS: ReadonlySet<string> = new Set<AskWriteTool>(['add_recommendation', 'submit_feedback']);
const WRITE_TOOLS: ReadonlySet<string> = new Set(ASK_WRITE_TOOLS);
const MAX_DEPTH = 3;

/**
 * 7a2 D12: a stored action may run only if its tool is an Ask write tool and every `clientId` in its input (objects and
 * arrays, depth <= 3) is the thread's client. A tool whose schema has `clientId` must name it; an input nested deeper
 * than the walk reads is refused rather than left unchecked.
 */
export function actionAllowed(action: { tool: string; input: unknown }, threadClientId: string): boolean {
  if (!WRITE_TOOLS.has(action.tool)) return false;
  if (action.input === null || typeof action.input !== 'object' || Array.isArray(action.input)) return false;
  let found = 0;
  const walk = (node: unknown, depth: number): boolean => {
    if (node === null || typeof node !== 'object') return true;
    if (depth > MAX_DEPTH) return false;
    if (Array.isArray(node)) return node.every((v) => walk(v, depth + 1));
    for (const [k, v] of Object.entries(node)) {
      if (k === 'clientId') {
        if (v !== threadClientId) return false;
        found++;
      } else if (!walk(v, depth + 1)) return false;
    }
    return true;
  };
  if (!walk(action.input, 0)) return false;
  return found > 0 || !CLIENT_ID_TOOLS.has(action.tool);
}
