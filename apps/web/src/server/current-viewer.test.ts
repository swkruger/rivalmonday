import { membership, supportSession } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { endSession, startSession } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedAuthUsers, truncateAuth } from '../../test/auth-fixtures';

const m = vi.hoisted(() => ({
  dbs: null as unknown,
  user: null as { id: string; email: string; name: string } | null,
  cookies: {} as Record<string, string>,
  path: '/agency',
  admins: [] as string[],
}));
const SECRET = 'c'.repeat(40);

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-rm-path': m.path }),
  cookies: async () => ({ get: (n: string) => (n in m.cookies ? { name: n, value: m.cookies[n] } : undefined) }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  },
}));
vi.mock('@/server/auth', () => ({ auth: () => ({ api: { getSession: async () => (m.user ? { user: m.user } : null) } }) }));
vi.mock('@/server/db', () => ({ dbs: () => m.dbs }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ authSecret: SECRET, linkSecrets: ['l'.repeat(40)], appUrl: 'http://localhost:3000' }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => m.admins }));

const dbs = openTestDbs();
m.dbs = dbs;
afterAll(() => dbs.closeAll());

const { getViewer, getViewerForClient, requireContext, requireOperatorContext } = await import('./current-viewer');
const { signSupportCookie } = await import('./support-cookie');
const { GET: endRoute } = await import('@/app/support/end/route');

const OP = { id: 'op', email: 'op@e.co', name: 'Olive' };
const redirectOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (url) return url;
    throw e;
  }
  throw new Error('expected a redirect');
};
const open = (now?: Date) => startSession(dbs.service, { platformUserId: 'op', agencyId: IDS.agencyB, reason: 'Checking setup', ...(now ? { now } : {}) });
const endWith = (cookie: string | undefined, next = '') =>
  endRoute(new NextRequest(`http://localhost:3000/support/end${next}`, { headers: cookie ? { cookie: `rm_support=${cookie}` } : {} }));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedAuthUsers(dbs.owner, OP);
  await dbs.service.insert(membership).values({ userId: 'op', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' });
  m.user = OP;
  m.cookies = {};
  m.path = '/agency';
  m.admins = ['op@e.co'];
});

describe('current viewer with a support cookie', () => {
  it('no cookie → the operator’s own membership context', async () => {
    const { viewer, ctx } = await requireContext();
    expect(viewer.kind).toBe('user');
    expect(ctx).toMatchObject({ agencyId: IDS.agencyA, role: 'agency_admin' });
    expect(ctx.support).toBeUndefined();
  });

  it('valid cookie + open session → support viewer and synthetic context', async () => {
    const s = await open();
    m.cookies = { rm_support: signSupportCookie(s.id) };
    const { viewer, ctx } = await requireContext();
    expect(viewer).toMatchObject({ kind: 'support', userId: 'op', name: 'Olive', session: { id: s.id, agencyId: IDS.agencyB } });
    expect(ctx).toMatchObject({ agencyId: IDS.agencyB, role: 'agency_admin', clientScope: 'all', support: { sessionId: s.id, platformUserId: 'op' } });
  });

  it('a member-less operator still gets the support viewer', async () => {
    await dbs.service.delete(membership);
    const s = await open();
    m.cookies = { rm_support: signSupportCookie(s.id) };
    expect((await requireContext()).viewer.kind).toBe('support');
  });

  it('a guest cookie with no signed-in user ignores rm_support', async () => {
    const s = await open();
    m.user = null;
    m.cookies = { rm_support: signSupportCookie(s.id) };
    expect(await getViewer()).toBeNull();
  });

  it('expired → redirect to the end route', async () => {
    const s = await open(new Date(Date.now() - 61 * 60_000));
    m.cookies = { rm_support: signSupportCookie(s.id) };
    expect(await redirectOf(requireContext())).toBe(`/support/end?next=${encodeURIComponent('/agency')}&sid=${s.id}`);
  });

  it('revoked → redirect to the end route', async () => {
    const s = await open();
    m.admins = [];
    m.cookies = { rm_support: signSupportCookie(s.id) };
    expect(await redirectOf(requireContext())).toBe(`/support/end?next=${encodeURIComponent('/agency')}&sid=${s.id}`);
  });

  it('tampered cookie → redirect to the end route carrying the current path', async () => {
    const s = await open();
    m.path = '/c/abc/changes?x=1';
    m.cookies = { rm_support: signSupportCookie(s.id, 'z'.repeat(40)) };
    expect(await redirectOf(requireContext())).toBe(`/support/end?next=${encodeURIComponent('/c/abc/changes?x=1')}`);
  });

  it('a valid cookie for another user’s session is treated as invalid', async () => {
    const s = await open();
    await seedAuthUsers(dbs.owner, { id: 'u2', email: 'u2@e.co', name: 'Uma' });
    await dbs.service.insert(membership).values({ userId: 'u2', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' });
    m.user = { id: 'u2', email: 'u2@e.co', name: 'Uma' };
    m.admins = ['op@e.co', 'u2@e.co'];
    m.cookies = { rm_support: signSupportCookie(s.id) };
    expect(await redirectOf(requireContext())).toBe(`/support/end?next=${encodeURIComponent('/agency')}&sid=${s.id}`);
    const [row] = await dbs.service.select().from(supportSession).where(eq(supportSession.id, s.id));
    expect(row?.endedAt).toBeNull();
  });

  it('full expired flow: render redirect → end route ends the row and lands on the agency page', async () => {
    const s = await open(new Date(Date.now() - 61 * 60_000));
    m.cookies = { rm_support: signSupportCookie(s.id) };
    const to = await redirectOf(requireContext());
    const res = await endWith(m.cookies.rm_support, to.slice('/support/end'.length));
    expect(res.headers.get('location')).toBe(`http://localhost:3000/platform/agencies/${IDS.agencyB}?ended=1`);
    expect(res.headers.get('set-cookie')).toMatch(/rm_support=;/);
    const [row] = await dbs.service.select().from(supportSession).where(eq(supportSession.id, s.id));
    expect(row?.endReason).toBe('expired');
  });

  it('full revoked flow: render redirect → end route ends the row and lands on /platform', async () => {
    const s = await open();
    m.admins = [];
    m.cookies = { rm_support: signSupportCookie(s.id) };
    const to = await redirectOf(requireContext());
    const res = await endWith(m.cookies.rm_support, to.slice('/support/end'.length));
    expect(res.headers.get('location')).toBe('http://localhost:3000/platform');
    const [row] = await dbs.service.select().from(supportSession).where(eq(supportSession.id, s.id));
    expect(row?.endReason).toBe('revoked');
  });

  it('an invalid cookie for a normal member ends in that member’s own context after the end route', async () => {
    m.admins = [];
    m.cookies = { rm_support: 'garbage.value' };
    const to = await redirectOf(requireContext());
    const res = await endWith(m.cookies.rm_support, to.slice('/support/end'.length));
    expect(res.headers.get('location')).toBe('http://localhost:3000/agency');
    expect(res.headers.get('set-cookie')).toMatch(/rm_support=;/);
    m.cookies = {};
    const { viewer, ctx } = await requireContext();
    expect(viewer.kind).toBe('user');
    expect(ctx.agencyId).toBe(IDS.agencyA);
  });
});

describe('requireOperatorContext', () => {
  it('ignores a valid support cookie', async () => {
    const s = await open();
    m.cookies = { rm_support: signSupportCookie(s.id) };
    const { viewer, ctx } = await requireOperatorContext();
    expect(viewer.kind).toBe('user');
    expect(ctx).toMatchObject({ agencyId: IDS.agencyA, role: 'agency_admin' });
    expect(ctx.support).toBeUndefined();
  });

  it('ignores an invalid cookie (no redirect)', async () => {
    m.cookies = { rm_support: 'garbage.value' };
    expect((await requireOperatorContext()).viewer.kind).toBe('user');
  });

  it('keeps 8a behaviour: a member-less operator goes to /no-access', async () => {
    await dbs.service.delete(membership);
    expect(await redirectOf(requireOperatorContext())).toBe('/no-access');
  });

  it('no user → sign-in', async () => {
    m.user = null;
    m.path = '/platform';
    expect(await redirectOf(requireOperatorContext())).toBe(`/sign-in?next=${encodeURIComponent('/platform')}`);
  });
});

describe('GET /support/end', () => {
  const rowOf = async (id: string) => (await dbs.service.select().from(supportSession).where(eq(supportSession.id, id)))[0]!;
  const sidQ = (id: string, next = '/agency') => `?next=${encodeURIComponent(next)}&sid=${id}`;
  const cleared = (res: Response) => /rm_support=;/.test(res.headers.get('set-cookie') ?? '');

  it('expired, sid matches → ends the row, clears the cookie, back to the agency page', async () => {
    const s = await open(new Date(Date.now() - 61 * 60_000));
    const res = await endWith(signSupportCookie(s.id), sidQ(s.id));
    expect(res.headers.get('location')).toBe(`http://localhost:3000/platform/agencies/${IDS.agencyB}?ended=1`);
    expect(res.headers.get('set-cookie')).toMatch(/rm_support=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
    expect((await rowOf(s.id)).endReason).toBe('expired');
  });

  it('revoked, sid matches → ends the row, clears the cookie, back to /platform', async () => {
    const s = await open();
    m.admins = [];
    const res = await endWith(signSupportCookie(s.id), sidQ(s.id));
    expect(res.headers.get('location')).toBe('http://localhost:3000/platform');
    expect(cleared(res)).toBe(true);
    expect((await rowOf(s.id)).endReason).toBe('revoked');
  });

  it('sid matches but the session is still ok (stale redirect) → ends nothing, keeps the cookie, goes to next', async () => {
    const s = await open();
    const res = await endWith(signSupportCookie(s.id), sidQ(s.id, '/agency/clients'));
    expect(res.headers.get('location')).toBe('http://localhost:3000/agency/clients');
    expect(cleared(res)).toBe(false);
    expect((await rowOf(s.id)).endedAt).toBeNull();
  });

  it('a valid cookie with no sid → never ends a session, keeps the cookie', async () => {
    const s = await open();
    const res = await endWith(signSupportCookie(s.id), '?next=/agency');
    expect(res.headers.get('location')).toBe('http://localhost:3000/agency');
    expect(cleared(res)).toBe(false);
    expect((await rowOf(s.id)).endedAt).toBeNull();
  });

  it('M1 race: a stale redirect for the replaced session keeps the fresh session and its cookie', async () => {
    const old = await open();
    const fresh = await open();
    expect((await rowOf(old.id)).endReason).toBe('replaced');
    const res = await endWith(signSupportCookie(fresh.id), sidQ(old.id));
    expect(res.headers.get('location')).toBe('http://localhost:3000/agency');
    expect(cleared(res)).toBe(false);
    expect((await rowOf(fresh.id)).endedAt).toBeNull();
  });

  it('an unverifiable cookie → clears it and follows a safe next', async () => {
    const res = await endWith('garbage.value', `?next=${encodeURIComponent('/c/abc/changes?x=1')}`);
    expect(res.headers.get('location')).toBe('http://localhost:3000/c/abc/changes?x=1');
    expect(cleared(res)).toBe(true);
  });

  it('sid matches another user’s session → invalid: clears the cookie, row untouched', async () => {
    const s = await open();
    await seedAuthUsers(dbs.owner, { id: 'u2', email: 'u2@e.co', name: 'Uma' });
    m.user = { id: 'u2', email: 'u2@e.co', name: 'Uma' };
    m.admins = ['op@e.co', 'u2@e.co'];
    const res = await endWith(signSupportCookie(s.id), sidQ(s.id));
    expect(res.headers.get('location')).toBe('http://localhost:3000/agency');
    expect(cleared(res)).toBe(true);
    expect((await rowOf(s.id)).endedAt).toBeNull();
  });

  it('sid matches an already-ended session → invalid: clears the cookie', async () => {
    const s = await open();
    await endSession(dbs.service, s.id, 'exit');
    const res = await endWith(signSupportCookie(s.id), sidQ(s.id));
    expect(res.headers.get('location')).toBe('http://localhost:3000/agency');
    expect(cleared(res)).toBe(true);
  });

  it('no signed-in user, sid matches → clears the cookie, row untouched', async () => {
    const s = await open();
    m.user = null;
    const res = await endWith(signSupportCookie(s.id), sidQ(s.id));
    expect(res.headers.get('location')).toBe('http://localhost:3000/agency');
    expect(cleared(res)).toBe(true);
    expect((await rowOf(s.id)).endedAt).toBeNull();
  });

  it('rejects open redirects in next', async () => {
    for (const next of ['//evil.com', 'https://evil.com', '/\\evil.com', 'evil.com']) {
      const res = await endWith(undefined, `?next=${encodeURIComponent(next)}`);
      expect(res.headers.get('location')).toBe('http://localhost:3000/');
    }
  });

  it('no cookie → clears (harmless) and goes to next', async () => {
    const res = await endWith(undefined, '?next=/agency');
    expect(res.headers.get('location')).toBe('http://localhost:3000/agency');
    expect(cleared(res)).toBe(true);
  });
});

describe('getViewerForClient (POST API path)', () => {
  it('an unusable support cookie falls back to normal resolution instead of redirecting', async () => {
    const s = await open(new Date(Date.now() - 61 * 60_000));
    m.cookies = { rm_support: signSupportCookie(s.id) };
    expect(await getViewerForClient(null)).toMatchObject({ kind: 'user', ctx: { agencyId: IDS.agencyA } });
  });

  it('a valid support cookie still yields the support viewer', async () => {
    const s = await open();
    m.cookies = { rm_support: signSupportCookie(s.id) };
    expect(await getViewerForClient(null)).toMatchObject({ kind: 'support' });
  });
});
