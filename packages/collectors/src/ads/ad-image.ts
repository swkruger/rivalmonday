import sharp from 'sharp';
import { sha256Hex } from '../evidence/recorder';
import { type FetchBytes, SsrfBlockedError } from '../net/guard';
import { HOST_BUSY, type HostRateLimiter } from '../web/rate-limit';
import { MAX_CAPTURE_WAIT_MS } from '../web/polite';
import type { RobotsPolicy, RobotsVerdict } from '../web/robots';
import { siteHost } from '../web/user-agent';

export const AD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const AD_IMAGE_ACCEPT = 'image/webp,image/png,image/jpeg;q=0.9';
export const AD_IMAGE_SOURCE = 'ad_image';
export const AD_IMAGE_COLLECTOR_VERSION = 'ad-image/1';
export const adImageObjectKey = (competitorId: string, captureId: string) => `evidence/${competitorId}/${captureId}/ad-image.webp`;
export type AdImageType = 'jpeg' | 'png' | 'webp';
export type AdImageRejection = 'too_large' | 'bad_type' | 'bad_image' | 'expired' | 'robots' | 'ssrf';

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
/** Magic bytes only (R6): the server's content type is never trusted. */
export function sniffImageType(b: Uint8Array): AdImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  return null;
}

export type NormalizedAdImage =
  | { ok: true; webp: Uint8Array; sha256: string; sourceSha256: string; width: number; height: number }
  | { ok: false; reason: 'too_large' | 'bad_type' | 'bad_image'; sourceSha256: string | null };

/** R6: ≤ 2 MiB, JPEG/PNG/WebP by magic bytes and by sharp's own reading, first frame, EXIF-rotated and stripped, ≤ 1024 px WebP q80. */
export async function normalizeAdImage(original: Uint8Array): Promise<NormalizedAdImage> {
  if (original.byteLength > AD_IMAGE_MAX_BYTES) return { ok: false, reason: 'too_large', sourceSha256: null };
  const sourceSha256 = sha256Hex(original);
  const type = sniffImageType(original);
  if (!type) return { ok: false, reason: 'bad_type', sourceSha256 };
  try {
    const img = sharp(original, { limitInputPixels: 4e7, animated: false, failOn: 'truncated' });
    const meta = await img.metadata();
    if (meta.format !== type) return { ok: false, reason: 'bad_type', sourceSha256 };
    const { data, info } = await img
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const webp = new Uint8Array(data);
    return { ok: true, webp, sha256: sha256Hex(webp), sourceSha256, width: info.width, height: info.height };
  } catch {
    return { ok: false, reason: 'bad_image', sourceSha256 };
  }
}

/** P15: Jev takes PNG/JPEG, not WebP. Decision calls only; the stored evidence stays the WebP. No resize. */
export async function toDecisionJpeg(webp: Uint8Array): Promise<{ data: Uint8Array; sha256: string }> {
  const data = new Uint8Array(await sharp(webp).jpeg({ quality: 85 }).toBuffer());
  return { data, sha256: sha256Hex(data) };
}

/** Error strings never carry a URL's path or query (signed CDN links): every URL in a message shrinks to its origin. */
const scrubUrls = (message: string): string => message.replace(/https?:\/\/[^\s"'<>)]+/gi, (u) => { try { return new URL(u).origin; } catch { return '[url]'; } }).replace(/\?\S*/g, '');

export interface AdMediaDeps {
  fetchBytes: FetchBytes;
  robots: RobotsPolicy;
  limiter: HostRateLimiter;
}
export type AdImageFetch =
  | { kind: 'ok'; bytes: Uint8Array; finalUrl: string }
  | { kind: 'rejected'; reason: Extract<AdImageRejection, 'too_large' | 'expired' | 'robots' | 'ssrf'> }
  | { kind: 'transient'; error: string }
  | { kind: 'deferred'; retryInMs: number };

/** R5 + conduct: robots (start host, and final host after a cross-host redirect), ≥ 3 s/host, defer past maxWaitMs, never sleep longer. */
export async function fetchAdImage(deps: AdMediaDeps, url: string, opts: { maxWaitMs?: number } = {}): Promise<AdImageFetch> {
  const max = opts.maxWaitMs ?? MAX_CAPTURE_WAIT_MS;
  const defer = (d: number | null): AdImageFetch => ({ kind: 'deferred', retryInMs: deps.limiter.deferIn(url, d) });
  const robotsOutcome = (v: RobotsVerdict): AdImageFetch | null =>
    v.allowed ? null : v.reason === 'robots_unavailable' ? { kind: 'transient', error: 'robots unavailable' } : { kind: 'rejected', reason: 'robots' };
  const r = await deps.limiter.withHostLock(url, async (): Promise<AdImageFetch> => {
    const known = deps.robots.peek(url);
    if (!known && deps.limiter.nextSlotIn(url, null) > max) return defer(null);
    const verdict = known ?? (await deps.robots.check(url));
    const refused = robotsOutcome(verdict);
    if (refused) return refused;
    if (deps.limiter.nextSlotIn(url, verdict.crawlDelaySeconds) > max) return defer(verdict.crawlDelaySeconds);
    await deps.limiter.wait(url, verdict.crawlDelaySeconds);
    let res: Awaited<ReturnType<FetchBytes>>;
    try {
      res = await deps.fetchBytes(url, { maxBytes: AD_IMAGE_MAX_BYTES, accept: AD_IMAGE_ACCEPT });
    } catch (err) {
      if (err instanceof SsrfBlockedError) return { kind: 'rejected', reason: 'ssrf' };
      return { kind: 'transient', error: scrubUrls(err instanceof Error ? err.message : String(err)) };
    }
    if (siteHost(res.finalUrl) !== siteHost(url)) {
      const after = robotsOutcome(await deps.robots.check(res.finalUrl));
      if (after) return after;
    }
    if (res.status === 429 || res.status >= 500) return { kind: 'transient', error: `HTTP ${res.status}` };
    if (res.status < 200 || res.status > 299) return { kind: 'rejected', reason: 'expired' }; // P4
    if (res.tooLarge) return { kind: 'rejected', reason: 'too_large' };
    if (!res.bytes || res.bytes.byteLength === 0) return { kind: 'transient', error: 'empty body' };
    return { kind: 'ok', bytes: res.bytes, finalUrl: res.finalUrl };
  });
  return r === HOST_BUSY ? defer(deps.robots.peek(url)?.crawlDelaySeconds ?? null) : r;
}
