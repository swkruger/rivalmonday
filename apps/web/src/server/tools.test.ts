import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolError } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { createTryCallTool, isHiddenToolError } from './tools';

describe('isHiddenToolError', () => {
  it('hides not_found, permission_denied and invalid_input behind a 404', () => {
    expect(isHiddenToolError(new ToolError('not_found', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('permission_denied', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('invalid_input', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('read_only_session', 'x'))).toBe(true); // a page read never 500s in a support session
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

describe('tool timing hook (Task 9)', () => {
  const ctx = {} as never;
  const reg = (impl: () => Promise<unknown>) => () => ({ invoke: impl }) as never;
  const withProfileDir = async (profile: string, run: (file: string) => Promise<void>) => {
    const dir = mkdtempSync(join(tmpdir(), 'tools-timing-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    vi.stubEnv('PROFILE_TOOLS', profile);
    try {
      await run(join(dir, '.profile', 'tools.ndjson'));
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('records each read, refused ones included, when PROFILE_TOOLS=1', async () => {
    await withProfileDir('1', async (file) => {
      await createTryCallTool(reg(async () => ({ id: 'x' })))(ctx, 'get_move', {});
      await createTryCallTool(reg(async () => { throw new ToolError('not_found', 'x'); }))(ctx, 'get_event', {});
      const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { tool: string; path: string; startMs: number; endMs: number });
      expect(rows.map((r) => r.tool)).toEqual(['get_move', 'get_event']);
      expect(rows[0]!.path).toBe(''); // outside a request
      expect(rows[0]!.endMs).toBeGreaterThanOrEqual(rows[0]!.startMs);
    });
  });
  it('records nothing by default', async () => {
    await withProfileDir('', async (file) => {
      await createTryCallTool(reg(async () => ({ id: 'x' })))(ctx, 'get_move', {});
      expect(existsSync(file)).toBe(false);
    });
  });
});
