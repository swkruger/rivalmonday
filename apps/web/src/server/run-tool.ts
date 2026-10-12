import 'server-only';
import type { AccessContext, CallOptions } from '@cs/core';
import { toFormResult } from './forms';
import { registry } from './tools';

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };
type Invoker = () => { invoke(ctx: AccessContext, name: string, input: unknown, opts?: CallOptions): Promise<unknown> };
/** `ask` = a write the user confirmed in Ask (6b e8); audited and attributed (`source = 'ask'`) on that channel. */
export type RunToolOptions = { channel?: 'web' | 'ask' };

/** For server actions: a tool refusal becomes a form message (invalid_input shown, not_found/permission_denied → "Not found"); internal errors propagate. */
export function createRunTool(reg: Invoker) {
  return async function run<T>(ctx: AccessContext, name: string, input: unknown, opts: RunToolOptions = {}): Promise<ToolResult<T>> {
    try {
      return { ok: true, data: (await reg().invoke(ctx, name, input, { channel: opts.channel ?? 'web' })) as T };
    } catch (e) {
      const r = toFormResult(e);
      return r.ok ? { ok: false, error: 'Not found' } : r;
    }
  };
}

export const runTool = createRunTool(registry);
