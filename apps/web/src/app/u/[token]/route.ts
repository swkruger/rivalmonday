import { verifyUnsubscribeToken } from '@cs/tools';
import { NextResponse } from 'next/server';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { unsubscribeFromTips, unsubscribeTarget } from '@/server/unsubscribe';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Phase 10: `/u/<token>` is the setup tips' `List-Unsubscribe` URL. A route handler (not a page) because one-click
 * unsubscribe (RFC 8058) POSTs here directly; a page and a route can't share one segment, so GET (a person opening the
 * link) only redirects to the confirm page `/u/<token>/confirm` and changes nothing. POST, no session: the confirm form
 * (→ `/u/<token>/done`) or a mail provider's one-click request (body `List-Unsubscribe=One-Click` → 200).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const env = webEnv();
  if (!verifyUnsubscribeToken(token, env.authSecret)) return notFound();
  return NextResponse.redirect(new URL(`/u/${token}/confirm`, env.appUrl), 303);
}

export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const env = webEnv();
  const service = dbs().service;
  const target = await unsubscribeTarget(service, token, env.authSecret);
  if (!target) return notFound();
  await unsubscribeFromTips(service, target.agencyId, new Date());
  // RFC 8058 allows the one-click body as urlencoded or multipart form data.
  const form = await req.formData().catch(() => null);
  if (form?.get('List-Unsubscribe') === 'One-Click') {
    return new Response("You won't get setup tips any more.", { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return NextResponse.redirect(new URL(`/u/${token}/done`, env.appUrl), 303);
}
