import { describe, expect, it, vi } from 'vitest';

const objects = new Map<string, Uint8Array>();
vi.mock('./db', () => ({ dbs: () => ({ app: {}, service: {} }) }));
vi.mock('./env', () => ({ webEnv: () => ({ appUrl: 'https://app.example', emailFrom: 'briefs@app.example', webMonitoring: false, kbImport: false, platformAdmins: ['op@example.com'], setupFakeLookup: true }) }));
vi.mock('./queue', () => ({ enqueueFor: () => async () => {}, jobStatusFor: () => async () => null, queueStatsFor: () => async () => ({ queues: [], lastHeartbeatAt: null }) }));
vi.mock('./runtime-env', () => ({ platformAdmins: () => ['op@example.com'] }));
vi.mock('./store', () => ({
  webStore: () => ({
    get: async (k: string) => objects.get(k) ?? null,
    put: async (k: string, b: Uint8Array) => void objects.set(k, b),
    delete: async (k: string) => void objects.delete(k),
  }),
}));

describe('toolDeps evidenceStore', () => {
  it('forwards delete to the store (avatar cleanup depends on it)', async () => {
    const { toolDeps } = await import('./tools');
    const store = toolDeps('test').evidenceStore!;
    objects.set('avatars/u1/x.png', new Uint8Array([1]));
    expect(store.delete).toBeTypeOf('function');
    await store.delete!('avatars/u1/x.png');
    expect(objects.has('avatars/u1/x.png')).toBe(false);
  });
});
