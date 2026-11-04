import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolError } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';
import { createTryCallTool, isHiddenToolError, reportDeferredAuditError } from './tools';

const afterMock = vi.hoisted(() => vi.fn());
vi.mock('next/server', () => ({ after: afterMock }));
const captureMock = vi.hoisted(() => vi.fn());
vi.mock('@sentry/nextjs', () => ({ captureException: captureMock }));

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

describe('deferred read audits (launch-gate D2)', () => {
  const ctx = {} as never;
  type Opts = { channel: string; deferAudit?: (t: () => Promise<void>) => void };
  const capture = (seen: (Opts | undefined)[]) => () => ({ invoke: async (_c: unknown, _n: string, _i: unknown, opts?: Opts) => { seen.push(opts); return { ok: true }; } }) as never;

  it('reads pass the web channel and a deferAudit hook that hands the task to next/server after()', async () => {
    afterMock.mockClear();
    const seen: (Opts | undefined)[] = [];
    await createTryCallTool(capture(seen))(ctx, 'get_move', {});
    expect(seen).toHaveLength(1);
    expect(seen[0]!.channel).toBe('web');
    const task = async () => {};
    seen[0]!.deferAudit!(task);
    expect(afterMock).toHaveBeenCalledWith(task);
  });

  it('keeps the hook under PROFILE_TOOLS timing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tools-defer-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    vi.stubEnv('PROFILE_TOOLS', '1');
    try {
      const seen: (Opts | undefined)[] = [];
      await createTryCallTool(capture(seen))(ctx, 'get_move', {});
      expect(seen[0]).toMatchObject({ channel: 'web', deferAudit: expect.any(Function) });
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('reportDeferredAuditError', () => {
  it('captures to Sentry with a deferred_audit tag and never throws', () => {
    const err = new Error('audit sink down');
    reportDeferredAuditError(err);
    expect(captureMock).toHaveBeenCalledWith(err, { tags: { where: 'deferred_audit' } });
    captureMock.mockImplementationOnce(() => { throw new Error('sentry down'); });
    expect(() => reportDeferredAuditError(err)).not.toThrow();
  });
});
