import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { SsrfBlockedError, type FetchBytes } from '../net/guard';
import { HostRateLimiter } from '../web/rate-limit';
import type { RobotsPolicy, RobotsVerdict } from '../web/robots';
import { AD_IMAGE_MAX_BYTES, fetchAdImage, normalizeAdImage, sniffImageType, toDecisionJpeg } from './ad-image';

const solid = (w: number, h: number) => ({ create: { width: w, height: h, channels: 3 as const, background: { r: 200, g: 30, b: 30 } } });
const png = (w = 40, h = 20) => sharp(solid(w, h)).png().toBuffer();
const jpeg = (w = 40, h = 20) => sharp(solid(w, h)).jpeg().toBuffer();
const webp = (w = 40, h = 20) => sharp(solid(w, h)).webp().toBuffer();

describe('sniffImageType', () => {
  it('jpeg/png/webp yes; SVG, HTML, GIF, empty no', async () => {
    expect(sniffImageType(await jpeg())).toBe('jpeg');
    expect(sniffImageType(await png())).toBe('png');
    expect(sniffImageType(await webp())).toBe('webp');
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffImageType(enc('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(enc('<!doctype html><html>'))).toBeNull();
    expect(sniffImageType(enc('GIF89a......'))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('normalizeAdImage', () => {
  it('PNG bytes served as image/jpeg normalise fine (type from bytes)', async () => {
    const r = await normalizeAdImage(await png());
    expect(r.ok).toBe(true);
    if (r.ok) expect(sniffImageType(r.webp)).toBe('webp');
  });

  it('bad_type when magic says PNG but sharp reads another format', async () => {
    // PNG signature on a JPEG body: the magic check passes, sharp's own reading disagrees (or cannot read it).
    const forged = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), await jpeg()]);
    const r = await normalizeAdImage(forged);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['bad_type', 'bad_image']).toContain(r.reason);
    // JPEG magic on a real PNG body: sharp reads png, magic says jpeg => bad_type.
    const jpegMagicOnPng = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), (await png()).subarray(3)]);
    const r2 = await normalizeAdImage(jpegMagicOnPng);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(['bad_type', 'bad_image']).toContain(r2.reason);
  });

  it('bad_image for a truncated PNG', async () => {
    const full = await sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 }, noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer();
    const r = await normalizeAdImage(full.subarray(0, Math.floor(full.length / 2)));
    expect(r).toMatchObject({ ok: false, reason: 'bad_image' });
  });

  it('pixel bomb (20000x20000 PNG header) => bad_image', async () => {
    const bomb = Buffer.from(await png(8, 8));
    bomb.writeUInt32BE(20000, 16);
    bomb.writeUInt32BE(20000, 20);
    const r = await normalizeAdImage(bomb);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_image');
  });

  it('animated WebP => one frame', async () => {
    const frame = (b: number) => sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 0, g: 0, b } } }).png().toBuffer();
    const animated = await sharp([await frame(0), await frame(255)], { join: { animated: true } })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    const pages = (await sharp(animated, { animated: true }).metadata()).pages;
    expect(pages).toBeGreaterThan(1);
    const r = await normalizeAdImage(animated);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect([r.width, r.height]).toEqual([30, 30]);
      expect((await sharp(r.webp, { animated: true }).metadata()).pages ?? 1).toBe(1);
    }
  });

  it('EXIF orientation 6 is applied and stripped', async () => {
    const src = await sharp(solid(40, 20)).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(src).metadata()).orientation).toBe(6);
    const r = await normalizeAdImage(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect([r.width, r.height]).toEqual([20, 40]);
      const meta = await sharp(r.webp).metadata();
      expect(meta.orientation).toBeUndefined();
      expect(meta.exif).toBeUndefined();
    }
  });

  it('2000x1000 => 1024x512 WebP, small image not enlarged', async () => {
    expect(await normalizeAdImage(await png(2000, 1000))).toMatchObject({ ok: true, width: 1024, height: 512 });
    expect(await normalizeAdImage(await png(100, 50))).toMatchObject({ ok: true, width: 100, height: 50 });
  });

  it('> 2 MiB => too_large without decoding', async () => {
    const r = await normalizeAdImage(new Uint8Array(AD_IMAGE_MAX_BYTES + 1));
    expect(r).toEqual({ ok: false, reason: 'too_large', sourceSha256: null });
  });
});

describe('toDecisionJpeg', () => {
  it('returns JPEG magic bytes and its own sha256', async () => {
    const n = await normalizeAdImage(await png(300, 100));
    if (!n.ok) throw new Error('fixture');
    const j = await toDecisionJpeg(n.webp);
    expect(sniffImageType(j.data)).toBe('jpeg');
    expect(j.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(j.sha256).not.toBe(n.sha256);
    expect((await sharp(j.data).metadata()).width).toBe(300);
  });
});

const allow: RobotsVerdict = { allowed: true, reason: 'allowed', crawlDelaySeconds: null, sitemaps: [] };
const URL1 = 'https://cdn.example.com/a.png?token=secret';
type Res = Awaited<ReturnType<FetchBytes>>;

function setup(over: { verdict?: RobotsVerdict | ((u: string) => RobotsVerdict); fetch?: (u: string) => Promise<Res>; limiter?: Partial<HostRateLimiter> } = {}) {
  const verdictOf = (u: string) => (typeof over.verdict === 'function' ? over.verdict(u) : (over.verdict ?? allow));
  const robots = { peek: vi.fn(() => null), check: vi.fn(async (u: string) => verdictOf(u)) } as unknown as RobotsPolicy;
  const okFetch = async (u: string): Promise<Res> => ({ status: 200, finalUrl: u, bytes: new Uint8Array([1, 2, 3]), tooLarge: false });
  const fetchBytes = vi.fn(over.fetch ?? okFetch) as unknown as FetchBytes;
  const limiter = Object.assign(new HostRateLimiter({ sleep: async () => {} }), over.limiter);
  return { deps: { fetchBytes, robots, limiter }, robots, fetchBytes };
}
const status = (s: number) => async (u: string): Promise<Res> => ({ status: s, finalUrl: u, bytes: null, tooLarge: false });

describe('fetchAdImage', () => {
  it('ok returns bytes and final url', async () => {
    expect(await fetchAdImage(setup().deps, URL1)).toMatchObject({ kind: 'ok', finalUrl: URL1 });
  });

  it('disallow => rejected robots, no fetch', async () => {
    const s = setup({ verdict: { ...allow, allowed: false, reason: 'disallowed' } });
    expect(await fetchAdImage(s.deps, URL1)).toEqual({ kind: 'rejected', reason: 'robots' });
    expect(s.fetchBytes).not.toHaveBeenCalled();
  });

  it('robots unavailable => transient', async () => {
    const s = setup({ verdict: { ...allow, allowed: false, reason: 'robots_unavailable' } });
    expect(await fetchAdImage(s.deps, URL1)).toEqual({ kind: 'transient', error: 'robots unavailable' });
    expect(s.fetchBytes).not.toHaveBeenCalled();
  });

  it('cross-host redirect re-checks robots on the final host', async () => {
    const s = setup({
      verdict: (u) => (new URL(u).hostname === 'other.example.net' ? { ...allow, allowed: false, reason: 'disallowed' } : allow),
      fetch: async () => ({ status: 200, finalUrl: 'https://other.example.net/x.png', bytes: new Uint8Array([1]), tooLarge: false }),
    });
    expect(await fetchAdImage(s.deps, URL1)).toEqual({ kind: 'rejected', reason: 'robots' });
    expect(s.robots.check).toHaveBeenCalledWith('https://other.example.net/x.png');
  });

  it('host busy => deferred, no fetch', async () => {
    const s = setup();
    let release!: () => void;
    const held = s.deps.limiter.withHostLock(URL1, () => new Promise<void>((r) => { release = r; }));
    expect((await fetchAdImage(s.deps, URL1)).kind).toBe('deferred');
    expect(s.fetchBytes).not.toHaveBeenCalled();
    release();
    await held;
  });

  it('slot > 10 s => deferred', async () => {
    const s = setup({ limiter: { nextSlotIn: () => 11_000 } });
    expect((await fetchAdImage(s.deps, URL1)).kind).toBe('deferred');
    expect(s.fetchBytes).not.toHaveBeenCalled();
  });

  it('SsrfBlockedError => rejected ssrf', async () => {
    const s = setup({ fetch: async (u) => { throw new SsrfBlockedError(u); } });
    expect(await fetchAdImage(s.deps, URL1)).toEqual({ kind: 'rejected', reason: 'ssrf' });
  });

  it('404/410/403/400 => expired', async () => {
    for (const code of [404, 410, 403, 400]) {
      expect(await fetchAdImage(setup({ fetch: status(code) }).deps, URL1)).toEqual({ kind: 'rejected', reason: 'expired' });
    }
  });

  it('503/429 => transient', async () => {
    for (const code of [503, 429]) {
      expect(await fetchAdImage(setup({ fetch: status(code) }).deps, URL1)).toEqual({ kind: 'transient', error: `HTTP ${code}` });
    }
  });

  it('tooLarge => too_large', async () => {
    const s = setup({ fetch: async (u) => ({ status: 200, finalUrl: u, bytes: null, tooLarge: true }) });
    expect(await fetchAdImage(s.deps, URL1)).toEqual({ kind: 'rejected', reason: 'too_large' });
  });
});
