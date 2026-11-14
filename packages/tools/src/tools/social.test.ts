import { hashInput } from '@cs/core/server';
import { auditLog, capture, evidence, observation, socialAccount, socialPost } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EnqueueJob } from '../deps';
import { createToolRegistry } from '../registry';
import type { SocialAccountsView, SocialActivityView } from './schemas';
import { ago, ctx, dbs, registry as reg, resetWorkspace, seedSelf } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const admin = ctx('agency_admin', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const mcp = { channel: 'mcp', tokenId: 't', tokenScope: 'read' } as never;
const X: string = IDS.competitorX;
const activity = (c = am, clientId: string = IDS.clientA1, meta?: never) => reg.invoke(c, 'get_social_activity', { clientId }, meta) as Promise<SocialActivityView>;
const accounts = (c = am, competitorId: string = X) => reg.invoke(c, 'list_social_accounts', { competitorId }) as Promise<SocialAccountsView>;
const confirm = (input: Record<string, unknown>, c = am) => reg.invoke(c, 'confirm_social_account', { competitorId: X, ...input });
const rows = (competitorId: string = X) => dbs.owner.select().from(socialAccount).where(eq(socialAccount.competitorId, competitorId));

const account = (o: Partial<typeof socialAccount.$inferInsert> = {}) => dbs.owner.insert(socialAccount).values({
  competitorId: X, network: 'facebook', handle: 'smithhvac', url: 'https://www.facebook.com/smithhvac', status: 'confirmed', confirmedBy: 'agency', ...o,
}).returning().then((r) => r[0]!);
async function pull(url: string, competitorId = X, kinds: Array<'text' | 'vendor_json'> = ['vendor_json']) {
  const [c] = await dbs.owner.insert(capture).values({ competitorId, source: 'social', url, status: 'ok', collectorVersion: 't', capturedAt: ago(1) }).returning();
  const ids: Record<string, string> = {};
  for (const kind of kinds) {
    const [e] = await dbs.owner.insert(evidence).values({ captureId: c!.id, kind, objectKey: `k/${c!.id}/${kind}`, sha256: `${kind}-${c!.id.slice(0, 4)}`, bytes: 1, contentType: 'text/plain' }).returning();
    ids[kind] = e!.id;
  }
  return { captureId: c!.id, ids };
}
const post = (captureId: string, id: string, text: string, days: number, network: 'facebook' | 'instagram' = 'facebook', competitorId = X) =>
  dbs.owner.insert(socialPost).values({ competitorId, network, postId: id, postedAt: ago(days), text, url: `https://fb.example/${id}`, firstCaptureId: captureId, firstSeenAt: ago(days) });
const followers = (captureId: string, n: number, days: number, key = 'facebook:smithhvac', competitorId = X) =>
  dbs.owner.insert(observation).values({ competitorId, captureId, kind: 'social_profile', key, data: { followers: n }, observedAt: ago(days) });

beforeEach(resetWorkspace);

describe('get_social_activity (18e)', () => {
  it('shows confirmed accounts only: suggested and rejected accounts (and their posts) never count', async () => {
    await account();
    await account({ network: 'instagram', handle: 'smith_ig', url: 'https://www.instagram.com/smith_ig', status: 'suggested', confirmedBy: null });
    await account({ handle: 'oldpage', url: 'https://www.facebook.com/oldpage', status: 'rejected' });
    const good = await pull('social:facebook:smithhvac', X, ['vendor_json', 'text']);
    const bad = await pull('social:facebook:oldpage');
    const sug = await pull('social:instagram:smith_ig');
    await post(good.captureId, 'g1', 'Spring tune-up $79', 3);
    await post(good.captureId, 'g2', 'We hired a tech', 9);
    await post(bad.captureId, 'b1', 'Old page post', 2);
    await post(sug.captureId, 's1', 'Suggested post', 2, 'instagram');
    await followers(good.captureId, 1200, 1);
    await followers((await pull('social:facebook:smithhvac')).captureId, 1000, 100);
    await followers(bad.captureId, 99, 1, 'facebook:oldpage');

    const r = await activity();
    const smith = r.businesses.find((b) => b.competitorId === X)!;
    expect(smith.accounts).toEqual([{
      network: 'facebook', handle: 'smithhvac', url: 'https://www.facebook.com/smithhvac', followers: 1200, followers90dChange: 200,
      posts30d: 2, lastPostAt: expect.any(String), evidenceId: good.ids.text,
    }]);
    expect(smith.offers).toEqual([{ network: 'facebook', postedAt: expect.any(String), text: 'Spring tune-up $79', url: 'https://fb.example/g1', evidenceId: good.ids.text }]);
    expect(JSON.stringify(r)).not.toMatch(/oldpage|smith_ig|Old page post|Suggested post/);

    // MCP cites text/screenshot evidence only.
    const m = await activity(am, IDS.clientA1, mcp);
    expect(m.businesses.find((b) => b.competitorId === X)!.accounts[0]!.evidenceId).toBe(good.ids.text);
  });

  it('a business with no confirmed account is listed with none; followers90dChange is null without an older reading', async () => {
    const self = await seedSelf();
    await account({ competitorId: self, handle: 'a1hvac', url: 'https://www.facebook.com/a1hvac' });
    const c = await pull('social:facebook:a1hvac', self);
    await followers(c.captureId, 50, 2, 'facebook:a1hvac', self);
    const r = await activity();
    expect(r.businesses.map((b) => [b.name, b.self, b.accounts.length])).toEqual([['A1 HVAC', true, 1], ['Smith HVAC', false, 0]]);
    expect(r.businesses[0]!.accounts[0]).toMatchObject({ followers: 50, followers90dChange: null, posts30d: 0, lastPostAt: null });
  });

  it('out-of-scope client → not_found', async () => {
    await expect(activity(owner, IDS.clientA2)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('agency social tools (18e)', () => {
  it('list_social_accounts returns every status; a rival tracked only by another agency is not_found', async () => {
    await account();
    await account({ network: 'instagram', handle: 'smith_ig', url: 'https://www.instagram.com/smith_ig', status: 'suggested', confirmedBy: null });
    await account({ handle: 'oldpage', url: 'https://www.facebook.com/oldpage', status: 'rejected' });
    const r = await accounts();
    expect(r.accounts.map((a) => [a.handle, a.status])).toEqual([['oldpage', 'rejected'], ['smithhvac', 'confirmed'], ['smith_ig', 'suggested']]);
    expect(r.accounts[1]).toMatchObject({ confirmedBy: 'agency', followers: null, lastPulledAt: null });
    await expect(accounts(ctx('agency_admin', 'all', [], IDS.agencyB), IDS.competitorY)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('confirm via pasted url creates a confirmed agency row with a lower-case handle', async () => {
    const r = await confirm({ url: 'https://www.facebook.com/SmithHVAC/', decision: 'confirm' }, admin) as { accountId: string; status: string };
    expect(r.status).toBe('confirmed');
    expect(await rows()).toEqual([expect.objectContaining({
      id: r.accountId, network: 'facebook', handle: 'smithhvac', url: 'https://www.facebook.com/SmithHVAC', status: 'confirmed', confirmedBy: 'agency', confirmedByUser: 'u-agency_admin',
    })]);
    await confirm({ url: 'instagram.com/Smith_IG', decision: 'confirm' });
    await confirm({ url: 'https://facebook.com/profile.php?id=100012345678', decision: 'confirm' });
    expect((await rows()).map((a) => [a.network, a.handle, a.externalId, a.status]).sort()).toEqual([
      ['facebook', '100012345678', '100012345678', 'confirmed'], ['facebook', 'smithhvac', null, 'rejected'], ['instagram', 'smith_ig', null, 'confirmed'],
    ]);
  });

  it.each(['https://example.com/smithhvac', 'https://facebook.com/groups/x/posts/1', 'https://facebook.com/profile.php?id=abc', 'not a url at all', 'https://instagram.com/'])('rejects %s as invalid_input', async (url) => {
    await expect(confirm({ url, decision: 'confirm' })).rejects.toMatchObject({ code: 'invalid_input', userFacing: true });
  });

  it('confirm demotes the previously confirmed account of the same network; reject sets rejected', async () => {
    const old = await account();
    const sug = await account({ handle: 'smith-hvac-llc', url: 'https://www.facebook.com/smith-hvac-llc', status: 'suggested', confirmedBy: null });
    const ig = await account({ network: 'instagram', handle: 'smith_ig', url: 'https://www.instagram.com/smith_ig' });
    await expect(confirm({ accountId: sug.id, decision: 'confirm' })).resolves.toEqual({ accountId: sug.id, status: 'confirmed' });
    const after = new Map((await rows()).map((a) => [a.id, a]));
    expect(after.get(old.id)!.status).toBe('rejected');
    expect(after.get(sug.id)).toMatchObject({ status: 'confirmed', confirmedBy: 'agency', confirmedByUser: 'u-account_manager' });
    expect(after.get(ig.id)!.status).toBe('confirmed');
    await expect(confirm({ accountId: ig.id, decision: 'reject' })).resolves.toEqual({ accountId: ig.id, status: 'rejected' });
    await expect(confirm({ accountId: '00000000-0000-4000-8000-000000000001', decision: 'reject' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('client role cannot confirm, find or list → not_found', async () => {
    const acc = await account({ status: 'suggested', confirmedBy: null });
    await expect(reg.invoke(owner, 'confirm_social_account', { competitorId: X, accountId: acc.id, decision: 'confirm' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(reg.invoke(owner, 'find_social_accounts', { competitorId: X })).rejects.toMatchObject({ code: 'not_found' });
    await expect(reg.invoke(owner, 'list_social_accounts', { competitorId: X })).rejects.toMatchObject({ code: 'not_found' });
    expect((await rows())[0]!.status).toBe('suggested');
  });

  it('an out-of-scope or untracked competitor is not_found for writes', async () => {
    await expect(confirm({ url: 'facebook.com/x', decision: 'confirm' }, ctx('account_manager', [IDS.clientA2]))).rejects.toMatchObject({ code: 'not_found' });
    await expect(confirm({ competitorId: '00000000-0000-4000-8000-000000000002', url: 'facebook.com/x', decision: 'confirm' })).rejects.toMatchObject({ code: 'not_found' });
    expect(await rows()).toEqual([]);
  });
});

describe('find_social_accounts (18e)', () => {
  const enqueued: unknown[] = [];
  const enqueue: EnqueueJob = async (job, data, singletonKey) => { enqueued.push({ job, data, singletonKey }); };
  // The real audit sink: the limit counts audit_log rows.
  const real = createToolRegistry({ app: dbs.app, service: dbs.service, enqueue });
  beforeEach(() => { enqueued.length = 0; });

  it('enqueues social-discover; a second find within 7 d is rate_limited, one after 7 d is not', async () => {
    await expect(real.invoke(admin, 'find_social_accounts', { competitorId: X })).resolves.toEqual({ queued: true });
    expect(enqueued).toEqual([{ job: 'social-discover', data: { competitorId: X }, singletonKey: `social-discover:${X}` }]);
    await expect(real.invoke(admin, 'find_social_accounts', { competitorId: X })).rejects.toMatchObject({ code: 'rate_limited', userFacing: true });
    expect(enqueued).toHaveLength(1);
    // Another member of the same agency is limited too (per business per agency).
    await expect(real.invoke(am, 'find_social_accounts', { competitorId: X })).rejects.toMatchObject({ code: 'rate_limited' });
    // An older ok row does not count.
    await dbs.owner.update(auditLog).set({ createdAt: ago(8) }).where(and(eq(auditLog.tool, 'find_social_accounts'), eq(auditLog.inputHash, hashInput({ competitorId: X }))));
    await expect(real.invoke(admin, 'find_social_accounts', { competitorId: X })).resolves.toEqual({ queued: true });
    expect(enqueued).toHaveLength(2);
  });
});
