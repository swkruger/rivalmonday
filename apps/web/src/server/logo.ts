import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

/**
 * Phase 10 logo pipeline (spec § Wizard, checklist, logo; f11). Every upload is re-encoded to a PNG that fits
 * 512×512 with metadata stripped; SVG is rasterised and never stored or served as SVG. The sniffed type wins over the
 * declared content type (a text file named `.png` is `unsupported_type`).
 */
export const LOGO_MAX_BYTES = 512 * 1024;
const MAX_SIDE = 512;
const MAX_INPUT_PIXELS = 25_000_000;

export type LogoError = 'too_large' | 'unsupported_type' | 'unsafe_svg' | 'undecodable';
type Sniffed = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';

/** Decided UI copy per error code. */
export const LOGO_ERROR_COPY: Record<LogoError, string> = {
  too_large: 'Logo must be 512 KB or smaller.',
  unsupported_type: 'Use a PNG, JPEG, WebP or SVG file.',
  unsafe_svg: 'This SVG contains scripts or external links. Export it as a plain SVG or PNG.',
  undecodable: "We couldn't read this image.",
};

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Magic bytes only. SVG = text that (after a BOM / whitespace) starts with `<?xml` or `<svg`, or starts with `<` and has an `<svg` tag near the top. */
export function sniffType(bytes: Uint8Array): Sniffed | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 4096)).replace(/^﻿/, '').trimStart();
  if (/^<\?xml[\s?]/i.test(head) || /^<svg[\s>/]/i.test(head)) return 'image/svg+xml';
  if (head.startsWith('<') && /<svg[\s>/]/i.test(head)) return 'image/svg+xml';
  return null;
}

/** Binding check (Task 8 brief): DTD/entities, scripts, foreignObject, event handlers, external/file/data:text hrefs. */
const UNSAFE_SVG = /<!ENTITY|<!DOCTYPE|<script|<foreignObject|\bon\w+\s*=|(xlink:)?href\s*=\s*["']\s*(https?:|file:|data:text)/i;
/**
 * Defence in depth beyond the brief: protocol-relative hrefs, hrefs that start with a character reference (an
 * entity-encoded scheme), XInclude, and CSS `url(...)` / `@import` reaching outside the document. The real barrier is
 * librsvg itself: rendering from a buffer has no base URL, so it resolves no external reference (pinned by a test).
 */
const UNSAFE_SVG_EXTRA = /href\s*=\s*["']\s*(\/\/|&#)|xi:include|url\(\s*["']?\s*(https?:|file:|\/\/)|@import/i;

async function svgDensity(bytes: Uint8Array): Promise<number | undefined> {
  // Rasterise small SVGs at a higher density so the PNG reaches 512 px on its longer side instead of staying icon-sized.
  const m = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const side = Math.max(m.width ?? 0, m.height ?? 0);
  if (!side || side >= MAX_SIDE) return undefined;
  return Math.min(72 * (MAX_SIDE / side), 2400);
}

export async function normalizeLogo(bytes: Uint8Array, contentType: string): Promise<{ png: Uint8Array; sha256: string } | { error: LogoError }> {
  void contentType; // declared type is informational only; the sniffed type decides
  if (bytes.byteLength > LOGO_MAX_BYTES) return { error: 'too_large' };
  const sniff = sniffType(bytes);
  if (!sniff) return { error: 'unsupported_type' };
  let density: number | undefined;
  try {
    if (sniff === 'image/svg+xml') {
      const text = new TextDecoder().decode(bytes);
      if (UNSAFE_SVG.test(text) || UNSAFE_SVG_EXTRA.test(text)) return { error: 'unsafe_svg' };
      density = await svgDensity(bytes);
    }
    // sharp drops metadata (EXIF, ICC, XMP) unless .withMetadata() is called.
    const out = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', ...(density ? { density } : {}) })
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { png: new Uint8Array(out), sha256: createHash('sha256').update(out).digest('hex') };
  } catch {
    return { error: 'undecodable' };
  }
}
