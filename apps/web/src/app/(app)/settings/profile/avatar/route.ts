import { AVATAR_ERROR_COPY, AVATAR_MAX_BYTES, type AvatarError } from '@/lib/avatar-limits';
import { normalizeAvatar } from '@/server/avatar';
import { getViewerForClient } from '@/server/current-viewer';
import { runTool } from '@/server/run-tool';
import { readCapped, sameOrigin } from '@/server/upload';

export const dynamic = 'force-dynamic';

/** Multipart framing (boundaries, part headers) on top of the file itself. */
const MAX_BODY_BYTES = AVATAR_MAX_BYTES + 16 * 1024;

const notFound = () => new Response('Not found', { status: 404 });
const refuse = (error: AvatarError) => Response.json({ error, message: AVATAR_ERROR_COPY[error] }, { status: 400 });

/**
 * `POST /settings/profile/avatar` (multipart field `file`): any signed-in user acting as themselves (support sessions,
 * guests and member-less users 404). Same shape as the logo upload: origin check, capped read, `normalizeAvatar`
 * re-encodes to a 256 px PNG, `upload_my_avatar` stores it. Errors: 400 `{ error, message }`. API-mode viewer: a page-mode
 * redirect for a stale support cookie would be a 307 to a GET-only route, so a 405 here.
 */
export async function POST(req: Request) {
  const viewer = await getViewerForClient(null);
  if (!viewer || viewer.kind !== 'user') return notFound();
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
  if (file.size > AVATAR_MAX_BYTES) return refuse('too_large');

  const avatar = await normalizeAvatar(new Uint8Array(await file.arrayBuffer()));
  if ('error' in avatar) return refuse(avatar.error);

  const r = await runTool<{ avatarUrl: string }>(viewer.ctx, 'upload_my_avatar', { png: Buffer.from(avatar.png).toString('base64'), sha256: avatar.sha256 });
  if (!r.ok) return r.error === 'Not found' ? notFound() : Response.json({ error: 'rejected', message: r.error }, { status: 400 });
  return Response.json({ avatarUrl: r.data.avatarUrl });
}
