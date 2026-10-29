import { confirmWaitlistEmail } from '@cs/tools';
import { NextResponse } from 'next/server';
import { webEnv } from '@/server/env';
import { toolDeps } from '@/server/tools';

export const dynamic = 'force-dynamic';

/** Phase 17a: the waitlist confirmation link. The token lives in the URL: never cached, never a referrer, never logged. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await confirmWaitlistEmail(toolDeps(), token, new Date());
  const res = NextResponse.redirect(new URL('expired' in r ? '/waitlist/confirmed?expired=1' : '/waitlist/confirmed', webEnv().appUrl));
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
