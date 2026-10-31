import { createHash } from 'node:crypto';
import { type AccessContext, toolkit, ToolError } from '@cs/core';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { myNotificationSettings } from '../preferences';

const { defineTool } = toolkit<ToolDeps>();
const OK = z.object({ ok: z.literal(true) });
const ok = { ok: true as const };

export const AVATAR_PREFIX = '/files/avatar/';
const MAX_AVATAR_PNG_BYTES = 512 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const OWN_AVATAR = /^\/files\/avatar\/([^/]+)\/([0-9a-f]{64})\.png$/;

/** An uploaded avatar's path, or null (initials): other values (e.g. an old Google URL in `user.image`) are ignored. */
export function avatarUrlOf(image: string | null): string | null {
  return image?.startsWith(AVATAR_PREFIX) ? image : null;
}

/** Guests (email-link sessions) have no profile. */
function requireSignedIn(ctx: AccessContext) {
  if (ctx.userId.startsWith('contact:')) throw new ToolError('permission_denied', 'Sign in to change your profile');
}

const keyOf = (userId: string, sha: string) => `avatars/${userId}/${sha}.png`;

/** The object key for `image` only when it is this user's own avatar path; anything else is never deleted. */
function ownAvatarKey(userId: string, image: string | null): string | null {
  const m = image ? OWN_AVATAR.exec(image) : null;
  return m && m[1] === userId ? keyOf(userId, m[2]!) : null;
}

async function readUser(deps: ToolDeps, userId: string) {
  const rows = await deps.service.execute<{ name: string; email: string; image: string | null }>(sql`select name, email, image from auth."user" where id = ${userId}`);
  const row = rows[0];
  if (!row) throw new ToolError('not_found', 'Profile not found');
  return row;
}

/** A failed delete leaves a harmless orphan (the pointer is the truth), so it is logged, never thrown. */
async function deleteAvatarObject(store: NonNullable<ToolDeps['evidenceStore']>, key: string | null): Promise<void> {
  if (!key || !store.delete) return;
  try {
    await store.delete(key);
  } catch (err) {
    console.error('[avatar] delete failed', (err as { name?: string } | null)?.name);
  }
}

export const getMyProfileTool = defineTool({
  name: 'get_my_profile',
  access: 'read',
  description: 'Your own name, email and avatar.',
  input: z.object({}),
  output: z.object({ name: z.string(), email: z.string(), avatarUrl: z.string().nullable() }),
  permission: 'read',
  supportHidden: true,
  supportMask: ['email'],
  async handler(ctx, _input, deps) {
    requireSignedIn(ctx);
    const u = await readUser(deps, ctx.userId);
    return { name: u.name, email: u.email, avatarUrl: avatarUrlOf(u.image) };
  },
});

export const getMyNotificationSettingsTool = defineTool({
  name: 'get_my_notification_settings',
  access: 'read',
  description: 'Your own notification settings for each agency and client you belong to.',
  input: z.object({}),
  output: z.object({ lists: z.array(z.object({
    contactId: z.string(), agencyName: z.string(), clientName: z.string().nullable(), email: z.string(), timezone: z.string().nullable(),
    quietHours: z.object({ start: z.string(), end: z.string() }).nullable(),
    kinds: z.array(z.object({ kind: z.string(), channels: z.record(z.string(), z.boolean()) })),
  })) }),
  permission: 'read',
  supportHidden: true,
  supportMask: ['lists[].email'],
  async handler(ctx, _input, deps) {
    requireSignedIn(ctx);
    return { lists: await myNotificationSettings(deps.service, ctx.userId) };
  },
});

export const updateMyProfileTool = defineTool({
  name: 'update_my_profile',
  access: 'write',
  description: 'Change your own display name.',
  input: z.object({
    name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use 80 characters or fewer.').refine((v) => /^[^\u0000-\u001f\u007f]+$/.test(v), 'Enter a name without line breaks.'),
  }),
  output: OK,
  permission: 'read',
  async handler(ctx, { name }, deps) {
    requireSignedIn(ctx);
    await deps.service.execute(sql`update auth."user" set name = ${name}, "updatedAt" = now() where id = ${ctx.userId}`);
    return ok;
  },
});

export const uploadMyAvatarTool = defineTool({
  name: 'upload_my_avatar',
  access: 'write',
  description: 'Store your normalised PNG avatar and point your profile at it.',
  input: z.object({
    png: z.string().min(1).max(Math.ceil(MAX_AVATAR_PNG_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'png must be base64'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex characters'),
  }),
  output: z.object({ avatarUrl: z.string() }),
  permission: 'read',
  async handler(ctx, { png, sha256 }, deps) {
    requireSignedIn(ctx);
    const store = deps.evidenceStore;
    if (!store) throw new ToolError('internal', 'Avatar storage is not configured');
    const bytes = new Uint8Array(Buffer.from(png, 'base64'));
    if (bytes.byteLength > MAX_AVATAR_PNG_BYTES || !PNG_SIGNATURE.every((v, i) => bytes[i] === v)) throw new ToolError('invalid_input', 'Avatar must be a PNG');
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new ToolError('invalid_input', 'Avatar checksum does not match');
    const previous = (await readUser(deps, ctx.userId)).image;
    // Content-addressed: an existing object is the same picture, so treat it as stored (store first; a failed update leaves a harmless orphan).
    try {
      await store.put(keyOf(ctx.userId, sha256), bytes, 'image/png');
    } catch (err) {
      if ((err as { code?: string }).code !== 'object_exists') throw err;
    }
    const avatarUrl = `${AVATAR_PREFIX}${ctx.userId}/${sha256}.png`;
    await deps.service.execute(sql`update auth."user" set image = ${avatarUrl}, "updatedAt" = now() where id = ${ctx.userId}`);
    if (previous !== avatarUrl) await deleteAvatarObject(store, ownAvatarKey(ctx.userId, previous));
    return { avatarUrl };
  },
});

export const removeMyAvatarTool = defineTool({
  name: 'remove_my_avatar',
  access: 'write',
  description: 'Remove your avatar and delete the stored picture.',
  input: z.object({}),
  output: OK,
  permission: 'read',
  async handler(ctx, _input, deps) {
    requireSignedIn(ctx);
    const store = deps.evidenceStore;
    if (!store) throw new ToolError('internal', 'Avatar storage is not configured');
    const previous = (await readUser(deps, ctx.userId)).image;
    await deps.service.execute(sql`update auth."user" set image = null, "updatedAt" = now() where id = ${ctx.userId}`);
    await deleteAvatarObject(store, ownAvatarKey(ctx.userId, previous));
    return ok;
  },
});

export const myProfileTools = [getMyProfileTool, getMyNotificationSettingsTool, updateMyProfileTool, uploadMyAvatarTool, removeMyAvatarTool];
