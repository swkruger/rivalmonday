/** Plain module: the photo control checks the size in the browser (Vercel rejects a body over 4.5 MB before the route runs). */
export const AVATAR_MAX_BYTES = 4 * 1024 * 1024;

export type AvatarError = 'too_large' | 'unsupported_type' | 'undecodable';

/** Decided UI copy per error code. */
export const AVATAR_ERROR_COPY: Record<AvatarError, string> = {
  too_large: 'Photo must be 4 MB or smaller.',
  unsupported_type: 'Use a PNG, JPEG or WebP image.',
  undecodable: "We couldn't read this image.",
};
