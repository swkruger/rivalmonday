import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { AVATAR_MAX_BYTES } from '@/lib/avatar-limits';
import { normalizeAvatar } from './avatar';

const solid = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#47A8E7' } });
const ok = (r: Awaited<ReturnType<typeof normalizeAvatar>>) => {
  if ('error' in r) throw new Error(`unexpected ${r.error}`);
  return r;
};

describe('normalizeAvatar', () => {
  it('crops a 400x200 to 256x256 PNG', async () => {
    const r = ok(await normalizeAvatar(new Uint8Array(await solid(400, 200).png().toBuffer())));
    const meta = await sharp(r.png).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 256, 256]);
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('applies EXIF orientation', async () => {
    // Stored 100x200 (wide=100): left half dark, right half light. Orientation 6 = rotate 90 CW on display, so the dark
    // (stored left) half ends up on top.
    const left = await sharp({ create: { width: 50, height: 200, channels: 3, background: '#000000' } }).png().toBuffer();
    const right = await sharp({ create: { width: 50, height: 200, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const src = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#ffffff' } })
      .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 50, top: 0 }])
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const r = ok(await normalizeAvatar(new Uint8Array(src)));
    const { data, info } = await sharp(r.png).greyscale().raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => data[y * info.width + x]!;
    expect(px(128, 20)).toBeLessThan(60);
    expect(px(128, 236)).toBeGreaterThan(200);
  });

  it('strips metadata', async () => {
    const src = await solid(300, 300).jpeg().withMetadata({ orientation: 1, exif: { IFD0: { Copyright: 'secret' } } }).toBuffer();
    const r = ok(await normalizeAvatar(new Uint8Array(src)));
    const meta = await sharp(r.png).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it('refuses SVG, text, 4 MB + 1', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    expect(await normalizeAvatar(svg)).toEqual({ error: 'unsupported_type' });
    expect(await normalizeAvatar(new TextEncoder().encode('hello'))).toEqual({ error: 'unsupported_type' });
    expect(await normalizeAvatar(new Uint8Array(AVATAR_MAX_BYTES + 1))).toEqual({ error: 'too_large' });
  });

  it('corrupt JPEG = undecodable', async () => {
    const bytes = new Uint8Array(await solid(300, 300).jpeg().toBuffer());
    const broken = bytes.slice(0, 200); // valid signature, truncated body
    expect(await normalizeAvatar(broken)).toEqual({ error: 'undecodable' });
  });
});
