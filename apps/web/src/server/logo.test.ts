import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { LOGO_ERROR_COPY, LOGO_MAX_BYTES, normalizeLogo, sniffType } from './logo';

const enc = (s: string) => new TextEncoder().encode(s);
const raster = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 71, g: 168, b: 231, alpha: 1 } } });

/** A PNG with only a signature + IHDR (valid CRC) claiming `w`×`h`: a decompression/pixel bomb as far as the header goes. */
function pngHeader(w: number, h: number): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, deflate, no filter, no interlace
  const type = Buffer.from('IHDR');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(13);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, ihdr])));
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), len, type, ihdr, crc, iend]));
}

const SVG_OK = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="256" viewBox="0 0 1024 256"><rect width="1024" height="256" fill="#2A6BAC"/><use href="#a"/></svg>';
const SVG_SMALL = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#F5A524"/></svg>';

const fx: Record<string, Uint8Array> = {};
beforeAll(async () => {
  fx.png = new Uint8Array(await raster(800, 400).png().toBuffer());
  fx.jpeg = new Uint8Array(await raster(300, 900).jpeg().withExif({ IFD0: { Copyright: 'secret-gps-owner' } }).toBuffer());
  fx.webp = new Uint8Array(await raster(600, 600).webp().toBuffer());
  fx.smallPng = new Uint8Array(await raster(40, 20).png().toBuffer());
});

const expectPng = async (r: Awaited<ReturnType<typeof normalizeLogo>>) => {
  if ('error' in r) throw new Error(`unexpected error ${r.error}`);
  const meta = await sharp(r.png).metadata();
  expect(meta.format).toBe('png');
  expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(512);
  expect(r.sha256).toBe(createHash('sha256').update(r.png).digest('hex'));
  expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
  return meta;
};

describe('sniffType', () => {
  it('reads magic bytes, not names or declared types', () => {
    expect(sniffType(fx.png!)).toBe('image/png');
    expect(sniffType(fx.jpeg!)).toBe('image/jpeg');
    expect(sniffType(fx.webp!)).toBe('image/webp');
    expect(sniffType(enc(SVG_OK))).toBe('image/svg+xml');
    expect(sniffType(enc(`﻿  \n${SVG_SMALL}`))).toBe('image/svg+xml');
    expect(sniffType(enc('<!-- made by hand -->\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml');
    expect(sniffType(enc('hello, this is a text file'))).toBeNull();
    expect(sniffType(enc('<html><body>hi</body></html>'))).toBeNull();
    expect(sniffType(enc('GIF89a....'))).toBeNull();
    expect(sniffType(new Uint8Array())).toBeNull();
  });
});

describe('normalizeLogo', () => {
  it('re-encodes a PNG to a PNG that fits 512×512', async () => {
    const meta = await expectPng(await normalizeLogo(fx.png!, 'image/png'));
    expect([meta.width, meta.height]).toEqual([512, 256]);
  });

  it('re-encodes JPEG and WebP to PNG and strips metadata (EXIF)', async () => {
    const j = await normalizeLogo(fx.jpeg!, 'image/jpeg');
    const jm = await expectPng(j);
    expect([jm.width, jm.height]).toEqual([171, 512]);
    expect(jm.exif).toBeUndefined();
    expect(Buffer.from((j as { png: Uint8Array }).png).includes('secret-gps-owner')).toBe(false);
    const wm = await expectPng(await normalizeLogo(fx.webp!, 'image/webp'));
    expect([wm.width, wm.height]).toEqual([512, 512]);
  });

  it('never enlarges a small raster', async () => {
    const m = await expectPng(await normalizeLogo(fx.smallPng!, 'image/png'));
    expect([m.width, m.height]).toEqual([40, 20]);
  });

  it('rasterises a plain SVG to PNG (never keeps SVG); small SVGs render up to 512 px', async () => {
    const big = await expectPng(await normalizeLogo(enc(SVG_OK), 'image/svg+xml'));
    expect([big.width, big.height]).toEqual([512, 128]);
    const small = await expectPng(await normalizeLogo(enc(SVG_SMALL), 'image/svg+xml'));
    expect([small.width, small.height]).toEqual([512, 256]);
  });

  it('the sniffed type wins over the declared content type', async () => {
    await expectPng(await normalizeLogo(fx.jpeg!, 'image/png'));
    await expectPng(await normalizeLogo(enc(SVG_SMALL), 'image/png'));
    expect(await normalizeLogo(enc('just text'), 'image/png')).toEqual({ error: 'unsupported_type' });
  });

  it.each([
    ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['onload', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>'],
    ['external href', '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png" width="10" height="10"/></svg>'],
    ['external xlink:href', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href = \'http://evil.example/x.png\'/></svg>'],
    ['file href', '<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///etc/passwd"/></svg>'],
    ['data:text href', '<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html,<b>x</b>"><rect width="1" height="1"/></a></svg>'],
    ['entity', '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>'],
    ['doctype', '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['foreignObject', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>'],
    ['protocol-relative href', '<svg xmlns="http://www.w3.org/2000/svg"><image href="//evil.example/x.png"/></svg>'],
    ['css url()', '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.example/p.svg#g)" width="1" height="1"/></svg>'],
    ['css @import', '<svg xmlns="http://www.w3.org/2000/svg"><style>@import "https://evil.example/a.css";</style></svg>'],
    ['entity-encoded href scheme', '<svg xmlns="http://www.w3.org/2000/svg"><image href="&#102;ile:///etc/passwd" width="1" height="1"/></svg>'],
    ['entity-encoded xlink:href scheme', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href=\' &#x68;ttps://evil.example/x.png\'/></svg>'],
    ['xi:include', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="secret.txt" parse="text"/></svg>'],
  ])('rejects an SVG with %s as unsafe_svg', async (_name, svg) => {
    expect(await normalizeLogo(enc(svg), 'image/svg+xml')).toEqual({ error: 'unsafe_svg' });
  });

  it('librsvg resolves no external reference from a buffer: an obfuscated file: href that slips past the regexes renders nothing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-logo-'));
    try {
      const red = join(dir, 'red.png');
      writeFileSync(red, await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer());
      // `fi&#108;e:` decodes to `file:` in the XML parser but matches neither the brief's regex nor `href="&#`.
      const url = pathToFileURL(red).href.replace(/^file:/, 'fi&#108;e:');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><image href="${url}" x="0" y="0" width="64" height="64"/></svg>`;
      const r = await normalizeLogo(enc(svg), 'image/svg+xml');
      if ('error' in r) throw new Error(`expected a render, got ${r.error}`);
      const { data, info } = await sharp(r.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
      expect(at(Math.floor(info.width / 2), Math.floor(info.height / 2))).toBe(0); // transparent: the file was not loaded
      expect(at(0, 0)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects anything over 512 KB before decoding (too_large)', async () => {
    const big = new Uint8Array(600 * 1024);
    big.set(fx.png!);
    expect(await normalizeLogo(big, 'image/png')).toEqual({ error: 'too_large' });
    expect(await normalizeLogo(new Uint8Array(LOGO_MAX_BYTES + 1), 'image/png')).toEqual({ error: 'too_large' });
  });

  it('rejects a text file named .png and other formats (unsupported_type)', async () => {
    expect(await normalizeLogo(enc('not an image at all'), 'image/png')).toEqual({ error: 'unsupported_type' });
    const gif = new Uint8Array(await raster(10, 10).gif().toBuffer());
    expect(await normalizeLogo(gif, 'image/gif')).toEqual({ error: 'unsupported_type' });
  });

  it('rejects a pixel bomb (20000×20000 header) and truncated data as undecodable', async () => {
    expect(await normalizeLogo(pngHeader(20000, 20000), 'image/png')).toEqual({ error: 'undecodable' });
    expect(await normalizeLogo(fx.png!.slice(0, 60), 'image/png')).toEqual({ error: 'undecodable' });
    expect(await normalizeLogo(enc('<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"><rect width="1" height="1"/></svg>'), 'image/svg+xml')).toEqual({ error: 'undecodable' });
  });

  it('has the decided copy for every error', () => {
    expect(LOGO_ERROR_COPY).toEqual({
      too_large: 'Logo must be 512 KB or smaller.',
      unsupported_type: 'Use a PNG, JPEG, WebP or SVG file.',
      unsafe_svg: 'This SVG contains scripts or external links. Export it as a plain SVG or PNG.',
      undecodable: "We couldn't read this image.",
    });
  });
});
