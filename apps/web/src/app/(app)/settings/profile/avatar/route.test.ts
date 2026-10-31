import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as Record<string, unknown> | null, runTool: vi.fn(), viewerFor: vi.fn() }));
// API mode only: a page-mode `getViewer` can answer a stale support cookie with a 307 to a GET-only route, a 405 on POST.
vi.mock('@/server/current-viewer', () => ({ getViewerForClient: m.viewerFor }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.example' }) }));
const { POST } = await import('./route');

const ORIGIN = 'https://app.example';
const me = { kind: 'user', userId: 'u1', ctx: { role: 'account_manager' } };
const png = async (w = 400, h = 200) => new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: '#47A8E7' } }).png().toBuffer());

function upload(bytes: Uint8Array | string | null, opts: { origin?: string | null } = {}) {
  const fd = new FormData();
  if (bytes !== null) fd.set('file', new Blob([typeof bytes === 'string' ? bytes : Buffer.from(bytes)], { type: 'image/png' }), 'me.png');
  const headers = new Headers();
  if (opts.origin !== null) headers.set('origin', opts.origin ?? ORIGIN);
  return new Request('https://app.example/settings/profile/avatar', { method: 'POST', body: fd, headers });
}

beforeEach(() => {
  m.viewer = me;
  m.viewerFor.mockReset();
  m.viewerFor.mockImplementation(async () => m.viewer);
  m.runTool.mockReset();
  m.runTool.mockImplementation(async (_c, _n, input: { sha256: string }) => ({ ok: true, data: { avatarUrl: `/files/avatar/u1/${input.sha256}.png` } }));
});

describe('POST /settings/profile/avatar', () => {
  it('normalises to 256x256 and stores via upload_my_avatar, returning the avatar URL', async () => {
    const res = await POST(upload(await png()));
    expect(res.status).toBe(200);
    const [ctx, name, input] = m.runTool.mock.calls[0]! as [unknown, string, { png: string; sha256: string }];
    expect(ctx).toBe(me.ctx);
    expect(name).toBe('upload_my_avatar');
    const bytes = Buffer.from(input.png, 'base64');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(input.sha256);
    expect((await sharp(bytes).metadata()).width).toBe(256);
    expect(((await res.json()) as { avatarUrl: string }).avatarUrl).toBe(`/files/avatar/u1/${input.sha256}.png`);
    expect(m.viewerFor).toHaveBeenCalledWith(null);
  });

  it('404s a cross-origin or origin-less post before reading the body', async () => {
    expect((await POST(upload(await png(), { origin: 'https://evil.example' }))).status).toBe(404);
    expect((await POST(upload(await png(), { origin: null }))).status).toBe(404);
    expect(m.runTool).not.toHaveBeenCalled();
  });

  it.each([[null], [{ kind: 'member-less' }], [{ kind: 'guest', ctx: {} }], [{ kind: 'support', ctx: {} }]])('404s for %j', async (viewer) => {
    m.viewer = viewer as Record<string, unknown> | null;
    expect((await POST(upload(await png()))).status).toBe(404);
    expect(m.runTool).not.toHaveBeenCalled();
  });

  it('too large: 400 with the decided copy', async () => {
    const res = await POST(upload(new Uint8Array(5 * 1024 * 1024)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'too_large', message: 'Photo must be 4 MB or smaller.' });
    expect(m.runTool).not.toHaveBeenCalled();
  });

  it('unsupported type: 400 with the decided copy', async () => {
    const res = await POST(upload('just text'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'unsupported_type', message: 'Use a PNG, JPEG or WebP image.' });
  });
});
