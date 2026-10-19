import 'server-only';
import type { AccessContext } from '@cs/core';
import type { RunbookOwner } from '@cs/tools';
import type { RunbookActionResult, RunbookOp, Tailoring } from '@/components/runbook/types';
import { runTool, type ToolResult } from './run-tool';

/** Maps one editor write to its runbook tool. Every gate lives in the tools; a refusal comes back as the form message ("Not found" for a gate). */
export async function applyRunbookOp(ctx: AccessContext, owner: RunbookOwner, op: RunbookOp): Promise<RunbookActionResult> {
  const call = (tool: string, input: Record<string, unknown>): Promise<ToolResult<unknown>> => runTool<unknown>(ctx, tool, { owner, ...input });
  let r: ToolResult<unknown>;
  switch (op.op) {
    case 'toggle': r = await call('set_runbook_item_enabled', { key: op.key, enabled: op.enabled }); break;
    case 'save': r = await call('update_runbook_item', { key: op.key, content: op.content, ...(op.businessAreaIds !== undefined ? { businessAreaIds: op.businessAreaIds } : {}) }); break;
    case 'pull': r = await call('pull_runbook_update', { key: op.key, ...(op.content !== undefined ? { content: op.content } : {}) }); break;
    case 'dismiss': r = await call('dismiss_runbook_update', { key: op.key }); break;
    case 'add': r = await call('add_runbook_item', { key: op.key }); break;
    case 'remove': r = await call('remove_runbook_item', { key: op.key }); break;
    case 'create': r = await call('add_runbook_item', { key: '*' }); break;
    case 'retailor': {
      const t = await call('retailor_runbook_item', { key: op.key });
      return t.ok ? { ok: true, proposed: (t.data as { proposed: Tailoring | null }).proposed } : t;
    }
    default: return { ok: false, error: 'Not found' };
  }
  return r.ok ? { ok: true } : r;
}
