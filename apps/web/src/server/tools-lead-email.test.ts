import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ dbs: () => ({ app: {}, service: {} }) }));
vi.mock('./env', () => ({ webEnv: () => ({ appUrl: 'https://app.example', emailFrom: 'briefs@app.example', webMonitoring: false, kbImport: false, platformAdmins: ['op@example.com'], setupFakeLookup: true }) }));
vi.mock('./queue', () => ({ enqueueFor: () => async () => {}, jobStatusFor: () => async () => null }));
vi.mock('./runtime-env', () => ({ platformAdmins: () => ['op@example.com'] }));
vi.mock('./store', () => ({ webStore: () => ({ get: async () => null, put: async () => {} }) }));

describe('toolDeps leadEmail (Phase 11c)', () => {
  it('wires the lead-mail transport, sender, app URL and platform operators so decline/assign emails send after commit', async () => {
    const { toolDeps } = await import('./tools');
    const d = toolDeps('test');
    expect(d.leadEmail).toBeTruthy();
    expect(d.leadEmail!.appUrl).toBe('https://app.example');
    expect(d.leadEmail!.fromAddress).toBe('briefs@app.example');
    expect(d.leadEmail!.platformAdmins).toEqual(['op@example.com']);
    expect(d.leadEmail!.transport.send).toBeTypeOf('function');
  });
});
