import { getViewer } from '@/server/current-viewer';
import { webEnv } from '@/server/env';
import { LOGO_ERROR_COPY, LOGO_MAX_BYTES, type LogoError, normalizeLogo } from '@/server/logo';
import { runTool } from '@/server/run-tool';

export const dynamic = 'force-dynamic';

/** Multipart framing (boundaries, part headers) on top of the file itself. */
const MAX_BODY_BYTES = LOGO_MAX_BYTES + 16 * 1024;

const notFound = () => new Response('Not found', { status: 404 });
const refuse = (error: LogoError) => Response.json({ error, message: LOGO_ERROR_COPY[error] }, { status: 400 });

/** CSRF: the branding form posts with `fetch` from our own origin, so the browser always sends `Origin`. A mismatch is a 404 like every other refusal (`/support/exit` uses 403 because it must still say why nothing ended; nothing here needs that). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  return origin !== null && origin === new URL(webEnv().appUrl).origin;
}

/** The request body, or null once it passes `max` bytes (stops reading; a lying or absent Content-Length can't make us buffer more). */
async function readCapped(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
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

/**
 * Phase 10 `POST /agency/settings/branding/logo` (multipart field `file`): agency admins only (everyone else 404, support
 * sessions included — their writes are refused anyway). Size is checked before decoding (Content-Length, then a capped
 * read, then the file size), `normalizeLogo` re-encodes to a ≤ 512 px PNG, and `upload_agency_logo` stores it and
 * points `agency.branding.logoUrl` at `/files/logo/<agency>/<sha>.png`. Errors: 400 `{ error, message }`.
 * Marking the wizard's branding step is the caller's job.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.kind !== 'user' || viewer.ctx.role !== 'agency_admin') return notFound();
  // Refusals are 404s (project rule), CSRF included; still before any body read.
  if (!sameOrigin(req)) return notFound();

  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return refuse('too_large');
  const body = await readCapped(req, MAX_BODY_BYTES);
  if (!body) return refuse('too_large');

  let file: FormDataEntryValue | null;
  try {
    const form = await new Response(body, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
    file = form.get('file');
  } catch {
    return refuse('unsupported_type');
  }
  if (!(file instanceof Blob)) return refuse('unsupported_type');
  if (file.size > LOGO_MAX_BYTES) return refuse('too_large');

  const logo = await normalizeLogo(new Uint8Array(await file.arrayBuffer()), file.type);
  if ('error' in logo) return refuse(logo.error);

  const r = await runTool<{ logoUrl: string }>(viewer.ctx, 'upload_agency_logo', { png: Buffer.from(logo.png).toString('base64'), sha256: logo.sha256 });
  if (!r.ok) return r.error === 'Not found' ? notFound() : Response.json({ error: 'rejected', message: r.error }, { status: 400 });
  return Response.json({ logoUrl: r.data.logoUrl });
}
