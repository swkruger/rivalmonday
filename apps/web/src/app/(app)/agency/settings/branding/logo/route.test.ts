import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as Record<string, unknown> | null, runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ getViewer: async () => m.viewer }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.example' }) }));
const { POST } = await import('./route');

const ORIGIN = 'https://app.example';
const admin = { kind: 'user', ctx: { role: 'agency_admin', agencyId: 'ag-1' } };
const png = async (w = 1000, h = 500) => new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: '#47A8E7' } }).png().toBuffer());

function upload(bytes: Uint8Array | string | null, opts: { type?: string; origin?: string | null; headers?: Record<string, string>; field?: string } = {}) {
  const fd = new FormData();
  if (bytes !== null) fd.set(opts.field ?? 'file', new Blob([typeof bytes === 'string' ? bytes : Buffer.from(bytes)], { type: opts.type ?? 'image/png' }), 'logo.png');
  const headers = new Headers(opts.headers);
  if (opts.origin !== null) headers.set('origin', opts.origin ?? ORIGIN);
  return new Request('https://app.example/agency/settings/branding/logo', { method: 'POST', body: fd, headers });
}

beforeEach(() => {
  m.viewer = admin;
  m.runTool.mockReset();
  m.runTool.mockImplementation(async (_ctx, _name, input: { sha256: string }) => ({ ok: true, data: { logoUrl: `https://app.example/files/logo/ag-1/${input.sha256}.png` } }));
});

describe('POST /agency/settings/branding/logo', () => {
  it('admin: normalises to a ≤512 px PNG and stores it via upload_agency_logo, returning the logo URL', async () => {
    const res = await POST(upload(await png()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logoUrl: string };
    expect(m.runTool).toHaveBeenCalledTimes(1);
    const [ctx, name, input] = m.runTool.mock.calls[0]! as [unknown, string, { png: string; sha256: string }];
    expect(ctx).toBe(admin.ctx);
    expect(name).toBe('upload_agency_logo');
    const bytes = Buffer.from(input.png, 'base64');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(input.sha256);
    const meta = await sharp(bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 512, 256]);
    expect(body).toEqual({ logoUrl: `https://app.example/files/logo/ag-1/${input.sha256}.png` });
  });

  it('404s for signed-out callers, guests, support sessions and non-admin roles, before reading the file', async () => {
    for (const v of [null, { kind: 'member-less' }, { kind: 'guest', ctx: { role: 'client_viewer' } }, { kind: 'support', ctx: { role: 'agency_admin' } }, { kind: 'user', ctx: { role: 'account_manager' } }, { kind: 'user', ctx: { role: 'client_owner' } }]) {
      m.viewer = v;
      expect((await POST(upload(await png()))).status).toBe(404);
    }
    expect(m.runTool).not.toHaveBeenCalled();
  });

  it('a tool refusal (not found) is a 404; any other refusal is a 400 with its message', async () => {
    m.runTool.mockResolvedValueOnce({ ok: false, error: 'Not found' });
    expect((await POST(upload(await png()))).status).toBe(404);
    m.runTool.mockResolvedValueOnce({ ok: false, error: 'Your workspace is paused.' });
    const res = await POST(upload(await png()));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'rejected', message: 'Your workspace is paused.' });
  });

  it('refuses a cross-origin or Origin-less post (CSRF) with 404, before reading the body', async () => {
    for (const origin of ['https://evil.example', null]) {
      const req = upload(await png(), { origin });
      expect((await POST(req)).status).toBe(404);
      expect(req.bodyUsed).toBe(false);
    }
    expect(m.runTool).not.toHaveBeenCalled();
  });

  it('a non-admin with a bad or missing Origin still gets 404 (never 403)', async () => {
    for (const v of [null, { kind: 'user', ctx: { role: 'account_manager' } }, { kind: 'support', ctx: { role: 'agency_admin' } }]) {
      m.viewer = v;
      for (const origin of ['https://evil.example', null]) expect((await POST(upload(await png(), { origin }))).status).toBe(404);
    }
    expect(m.runTool).not.toHaveBeenCalled();
  });

  it.each([
    ['too_large', () => upload(new Uint8Array(600 * 1024)), 'Logo must be 512 KB or smaller.'],
    ['unsupported_type', () => upload('this is a text file', { type: 'image/png' }), 'Use a PNG, JPEG, WebP or SVG file.'],
    ['unsafe_svg', () => upload('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', { type: 'image/svg+xml' }), 'This SVG contains scripts or external links. Export it as a plain SVG or PNG.'],
    ['undecodable', () => upload(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0])), "We couldn't read this image."],
    ['unsupported_type', () => upload(null), 'Use a PNG, JPEG, WebP or SVG file.'],
    ['unsupported_type', () => upload('x', { field: 'logo' }), 'Use a PNG, JPEG, WebP or SVG file.'],
  ])('400 { error: %s } with the decided copy', async (code, req, message) => {
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: code, message });
    expect(m.runTool).not.toHaveBeenCalled();
  });

  it('rejects a declared Content-Length over the limit without reading the body', async () => {
    const req = upload(await png(), { headers: { 'content-length': String(5 * 1024 * 1024) } });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'too_large' });
    expect(req.bodyUsed).toBe(false);
  });

  it('stops reading a streamed body once it passes the limit', async () => {
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 1;
        if (pulled > 100) c.close();
        else c.enqueue(chunk);
      },
    }, { highWaterMark: 0 });
    const req = new Request('https://app.example/agency/settings/branding/logo', {
      method: 'POST', body, headers: { origin: ORIGIN, 'content-type': 'multipart/form-data; boundary=x' }, duplex: 'half',
    } as RequestInit);
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'too_large' });
    expect(pulled).toBeLessThan(20);
  });
});
