import { ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { createTryCallTool, isHiddenToolError } from './tools';

describe('isHiddenToolError', () => {
  it('hides not_found, permission_denied and invalid_input behind a 404', () => {
    expect(isHiddenToolError(new ToolError('not_found', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('permission_denied', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('invalid_input', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('internal', 'x'))).toBe(false);
    expect(isHiddenToolError(new Error('x'))).toBe(false);
  });
});

describe('tryCallTool', () => {
  const ctx = {} as never;
  const reg = (impl: () => Promise<unknown>) => () => ({ invoke: impl }) as never;
  const refusing = (code: 'not_found' | 'permission_denied' | 'invalid_input') => createTryCallTool(reg(async () => { throw new ToolError(code, 'secret'); }));

  it('returns the data on success', async () => {
    await expect(createTryCallTool(reg(async () => ({ id: 'x' })))(ctx, 't', {})).resolves.toEqual({ id: 'x' });
  });
  it('gives the same null for a retracted, foreign or malformed id (no existence leak)', async () => {
    await expect(refusing('not_found')(ctx, 'get_event', {})).resolves.toBeNull();
    await expect(refusing('permission_denied')(ctx, 'get_event', {})).resolves.toBeNull();
    await expect(refusing('invalid_input')(ctx, 'get_event', {})).resolves.toBeNull();
  });
  it('lets other failures reach the error boundary', async () => {
    await expect(createTryCallTool(reg(async () => { throw new ToolError('internal', 'boom'); }))(ctx, 't', {})).rejects.toThrow('boom');
  });
});
