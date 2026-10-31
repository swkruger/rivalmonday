import 'server-only';
import { webEnv } from '@/server/env';

/** CSRF: the branding form posts with `fetch` from our own origin, so the browser always sends `Origin`. A mismatch is a 404 like every other refusal (`/support/exit` uses 403 because it must still say why nothing ended; nothing here needs that). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  return origin !== null && origin === new URL(webEnv().appUrl).origin;
}

/** The request body, or null once it passes `max` bytes (stops reading; a lying or absent Content-Length can't make us buffer more). */
export async function readCapped(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      // Stop pulling and let go; the runtime discards the rest. (Not `cancel()`: undici's FormData-backed bodies throw
      // an unhandled "ReadableStream is already closed" when cancelled mid-stream.)
      reader.releaseLock();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
