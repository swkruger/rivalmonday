'use server';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { consentIdFor } from '@cs/tools';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import type { FormResult } from '@/server/forms';
import { bindConsent, consentOptions, pickConsent } from '@/server/oauth-consent';

const EXPIRED = 'This request has expired. Start again from your AI app.';

/**
 * Ruling R6: accept/deny through the plugin's own handler (its `auth().api.oauth2Consent` throws without a request).
 * The session cookie is forwarded so the plugin acts for the signed-in user; returns the client redirect URL or null.
 */
async function pluginConsent(oauthQuery: string, accept: boolean): Promise<string | null> {
  const { appUrl } = webEnv();
  const h = await headers();
  const res = await auth().handler(new Request(`${appUrl}/api/auth/oauth2/consent`, {
    method: 'POST',
    headers: { cookie: h.get('cookie') ?? '', origin: appUrl, 'content-type': 'application/json' },
    body: JSON.stringify({ accept, oauth_query: oauthQuery }),
  }));
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { url?: unknown } | null;
  return typeof body?.url === 'string' ? body.url : null;
}

/**
 * Review focus 4: the chosen workspace and scope are re-derived from the user's live memberships (a tampered form
 * fails `pickConsent` before the plugin is asked), and the binding is written after the plugin accepted but BEFORE
 * the browser is redirected with the code. Never logs the OAuth query or the redirect URL (it carries the code).
 */
export async function decideConsent(_: FormResult, fd: FormData): Promise<FormResult> {
  const viewer = await getViewer();
  // A member-less user may still cancel; only a guest link session (or none) is refused.
  if (!viewer || viewer.kind === 'guest') return { ok: false, error: 'Sign in to connect an app.' };
  const oauthQuery = String(fd.get('oauth_query') ?? '');
  if (!(await verifyOAuthQueryParams(oauthQuery, webEnv().authSecret).catch(() => false))) return { ok: false, error: EXPIRED };
  const q = new URLSearchParams(oauthQuery);
  const oauthClientId = q.get('client_id') ?? '';
  let to: string | null;
  if (fd.get('decision') !== 'allow') {
    to = await pluginConsent(oauthQuery, false);
    if (!to) return { ok: false, error: EXPIRED };
  } else {
    const service = dbs().service;
    const target = pickConsent(await consentOptions(service, viewer.userId, q.get('scope')), String(fd.get('membershipId') ?? ''), String(fd.get('scope') ?? ''));
    if (!target) return { ok: false, error: 'Choose a workspace and access level you have.' };
    to = await pluginConsent(oauthQuery, true);
    if (!to) return { ok: false, error: EXPIRED };
    const consentId = await consentIdFor(service, viewer.userId, oauthClientId);
    if (!consentId) return { ok: false, error: 'Something went wrong. Start again from your AI app.' };
    try {
      await bindConsent(service, { consentId, oauthClientId, userId: viewer.userId, target });
    } catch {
      // The code in `to` is never delivered, so the client cannot redeem it.
      return { ok: false, error: 'Something went wrong. Start again from your AI app.' };
    }
  }
  redirect(to); // outside any try: redirect() throws
}
