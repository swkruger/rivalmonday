import { ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { createRunTool } from './run-tool';

const ctx = {} as never;
const reg = (impl: () => Promise<unknown>) => () => ({ invoke: impl });

describe('runTool', () => {
  it('returns the data on success', async () => {
    await expect(createRunTool(reg(async () => ({ id: 'x' })))(ctx, 't', {})).resolves.toEqual({ ok: true, data: { id: 'x' } });
  });
  it('shows invalid_input messages and hides not_found / permission_denied', async () => {
    await expect(createRunTool(reg(async () => { throw new ToolError('invalid_input', 'Name is required'); }))(ctx, 't', {})).resolves.toEqual({ ok: false, error: 'Name is required' });
    await expect(createRunTool(reg(async () => { throw new ToolError('permission_denied', 'secret'); }))(ctx, 't', {})).resolves.toEqual({ ok: false, error: 'Not found' });
    await expect(createRunTool(reg(async () => { throw new ToolError('not_found', 'secret'); }))(ctx, 't', {})).resolves.toEqual({ ok: false, error: 'Not found' });
  });
  it('lets internal failures reach the error boundary', async () => {
    await expect(createRunTool(reg(async () => { throw new ToolError('internal', 'boom'); }))(ctx, 't', {})).rejects.toThrow('boom');
  });
});
