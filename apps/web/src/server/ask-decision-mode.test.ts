import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ createAiFromEnv: vi.fn(async () => ({})) }));
vi.mock('@cs/ai', async (orig) => ({ ...(await orig<typeof import('@cs/ai')>()), createAiFromEnv: m.createAiFromEnv, loadAiConfigFile: async () => ({}) }));
vi.mock('./db', () => ({ dbs: () => ({ app: {}, service: {} }) }));
vi.mock('./env', () => ({ webEnv: () => ({ askFakeAi: false, appUrl: 'http://localhost' }) }));
vi.mock('./tools', () => ({ registry: () => ({}), toolDeps: () => ({ evidenceStore: { get: async () => null } }) }));

const { askDeps } = await import('./ask');

describe('18e: Ask AI wiring', () => {
  it('the real Ai is built with the decision-mode source (arg 7)', async () => {
    await askDeps().catch(() => undefined);
    expect(m.createAiFromEnv).toHaveBeenCalledTimes(1);
    const src = (m.createAiFromEnv.mock.calls[0] as unknown[])[6] as { read: unknown; reevalCallsToday: unknown };
    expect(typeof src.read).toBe('function');
    expect(typeof src.reevalCallsToday).toBe('function');
  });
});
