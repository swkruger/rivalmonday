import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEMO_OPERATOR_EMAIL } from '@cs/demo/users';
import type { ToolDeps } from '@cs/tools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Final-review I1: each environment's registry is bound to the environment it was built for, not to whatever
// `.dev-env.json` says when a tool later runs. Nothing here connects to a database or to pg-boss.
const createDbMock = vi.hoisted(() => vi.fn());
vi.mock('@cs/db', async (orig) => ({ ...(await orig<typeof import('@cs/db')>()), createDb: createDbMock }));
const built = vi.hoisted(() => [] as ToolDeps[]);
vi.mock('@cs/tools', async (orig) => ({
  ...(await orig<typeof import('@cs/tools')>()),
  createToolRegistry: vi.fn((deps: ToolDeps) => {
    built.push(deps);
    return { deps };
  }),
}));
const dbsMock = vi.hoisted(() => vi.fn((name?: string) => ({ app: { name } as never, service: { name } as never })));
vi.mock('./db', () => ({ dbs: dbsMock }));
vi.mock('./env', () => ({ webEnv: () => ({ webMonitoring: undefined, platformAdmins: ['owner@example.com'], queueDatabaseUrl: 'postgres://fake' }) }));
const boss = vi.hoisted(() => ({ on: vi.fn(), start: vi.fn(async () => {}), send: vi.fn(async () => 'id'), stop: vi.fn(async () => {}) }));
vi.mock('pg-boss', () => ({ default: vi.fn(() => boss) }));

describe('registry is bound to the environment it was built for', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'web-tools-env-'));
    file = join(dir, 'dev-env.json');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_PANEL', '1');
    vi.stubEnv('RM_DEV_ENV_FILE', file);
    built.length = 0;
  });
  afterEach(async () => {
    const { clearEnvCaches } = await import('./env-cache');
    await clearEnvCaches();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
    createDbMock.mockReset();
    dbsMock.mockClear();
    boss.send.mockClear();
  });

  it('the DEMO registry refuses jobs even when DEV is live at call time', async () => {
    const { writeDevEnv } = await import('./dev-guard');
    const { BACKGROUND_OFF } = await import('./queue');
    const { registry } = await import('./tools');
    await writeDevEnv(file, 'demo');
    registry();
    const deps = built.at(-1)!;
    expect(dbsMock).toHaveBeenCalledWith('demo');
    expect(deps.platformAdmins).toContain(DEMO_OPERATOR_EMAIL);

    await writeDevEnv(file, 'dev');
    await expect(deps.enqueue!('suggest-competitors', { clientId: 'x' }, 'x')).rejects.toThrow(BACKGROUND_OFF);
    await expect(deps.jobStatus!('suggest-competitors', 'x')).resolves.toBeNull();
    expect(boss.send).not.toHaveBeenCalled();
    expect(createDbMock).not.toHaveBeenCalled();
  });

  it('the DEV registry uses the real queue even when DEMO is live at call time', async () => {
    createDbMock.mockReturnValue({ db: { execute: vi.fn(async () => []) }, close: async () => {} });
    const { writeDevEnv } = await import('./dev-guard');
    const { registry } = await import('./tools');
    await writeDevEnv(file, 'dev');
    registry();
    const deps = built.at(-1)!;
    expect(dbsMock).toHaveBeenCalledWith('dev');
    expect(deps.platformAdmins).not.toContain(DEMO_OPERATOR_EMAIL);

    await writeDevEnv(file, 'demo');
    await deps.enqueue!('suggest-competitors', { clientId: 'x' }, 'suggest:x');
    expect(boss.send).toHaveBeenCalledWith('suggest-competitors', { clientId: 'x' }, { singletonKey: 'suggest:x' });
    await expect(deps.jobStatus!('suggest-competitors', 'x')).resolves.toBeNull();
    expect(createDbMock).toHaveBeenCalledTimes(1);
  });
});
