'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireOperatorContext } from '@/server/current-viewer';
import type { FormResult } from '@/server/forms';
import { runTool } from '@/server/run-tool';
import { SUPPORT_COOKIE, signSupportCookie } from '@/server/support-cookie';
import { sendSupportSessionStartedEmail } from '@/server/support-email';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const isLocalHost = (host: string) => LOCAL_HOSTS.has(host.toLowerCase().replace(/:\d+$/, ''));

/**
 * Phase 8b: "Start read-only session". Runs on the operator's own context (the tool needs platform staff+), then sets
 * `rm_support` for exactly the session's lifetime (httpOnly, sameSite=lax, path=/, no domain, Secure except on a
 * localhost host), sends the best-effort "support opened a session" email and opens the agency. Refusals come back
 * through `runTool` (→ `toFormResult`) and stay in the dialog.
 */
export async function startSupportSessionAction(_prev: FormResult, fd: FormData): Promise<FormResult> {
  const { ctx } = await requireOperatorContext();
  const agencyId = String(fd.get('agencyId') ?? '').slice(0, 64);
  const reason = String(fd.get('reason') ?? '').slice(0, 1200);
  const r = await runTool<{ sessionId: string; expiresAt: string }>(ctx, 'start_support_session', { agencyId, reason });
  if (!r.ok) return r;
  const maxAge = Math.max(0, Math.floor((Date.parse(r.data.expiresAt) - Date.now()) / 1000));
  const secure = !isLocalHost((await headers()).get('host') ?? '');
  (await cookies()).set(SUPPORT_COOKIE, signSupportCookie(r.data.sessionId), { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge });
  await sendSupportSessionStartedEmail(r.data.sessionId);
  redirect('/agency');
}
