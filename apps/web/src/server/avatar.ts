import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { sniffType } from './logo';

export const AVATAR_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Profile photo pipeline: every upload becomes a 256×256 centre-cropped PNG with metadata stripped (EXIF orientation
 * applied first). Sniffed type decides; SVG and unknown (HEIC included) are `unsupported_type`. An animated WebP keeps
 * its first frame.
 */
const SIDE = 256;
const MAX_INPUT_PIXELS = 50_000_000;

export type AvatarError = 'too_large' | 'unsupported_type' | 'undecodable';

/** Decided UI copy per error code. */
export const AVATAR_ERROR_COPY: Record<AvatarError, string> = {
  too_large: 'Photo must be 4 MB or smaller.',
  unsupported_type: 'Use a PNG, JPEG or WebP image.',
  undecodable: "We couldn't read this image.",
};

export async function normalizeAvatar(bytes: Uint8Array): Promise<{ png: Uint8Array; sha256: string } | { error: AvatarError }> {
  if (bytes.byteLength > AVATAR_MAX_BYTES) return { error: 'too_large' };
  const sniff = sniffType(bytes);
  if (sniff !== 'image/png' && sniff !== 'image/jpeg' && sniff !== 'image/webp') return { error: 'unsupported_type' };
  try {
    // sharp drops metadata (EXIF, ICC, XMP) unless .withMetadata() is called; rotate() bakes the orientation in first.
    const out = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize(SIDE, SIDE, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { png: new Uint8Array(out), sha256: createHash('sha256').update(out).digest('hex') };
  } catch {
    return { error: 'undecodable' };
  }
}
