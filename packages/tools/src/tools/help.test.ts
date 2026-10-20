import { type AccessContext, createAccessContext, type HelpAudience } from '@cs/core';
import { agency, kbArticle } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';
import { ctx, dbs, resetWorkspace } from './workspace-fixtures';

type Guide = { id: string; title: string; sections: { heading: string; markdown: string }[] } | null;
type GuideList = { guides: { helpKey: string; title: string; articleId: string }[] };

const registry = createToolRegistry({ app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });
const admin = ctx('agency_admin', 'all');
const am = ctx('account_manager', [IDS.clientA1]);
const owner = ctx('client_owner', [IDS.clientA1]);
const viewer = ctx('client_viewer', [IDS.clientA1]);
const adminB = ctx('agency_admin', 'all', [], IDS.agencyB);
const op = createAccessContext({ agencyId: IDS.agencyA, userId: 'op', role: 'agency_admin', clientScope: 'all', features: [] });

const BODY = (tag: string) => `## What this page tells you\n\n${tag} overview for {{product}}.\n\n## How to use it\n\n- Ask {{assistant}} about {{client}}.\n\n\`\`\`\n## not a heading\n\`\`\`\n\n## Common questions\n\n**Why?** Because.`;

interface Row { helpKey?: string; audience?: HelpAudience; level?: 'platform' | 'agency'; agencyId?: string; title?: string; status?: 'draft' | 'published'; body?: string }
async function guide(r: Row): Promise<string> {
  const level = r.level ?? 'platform';
  const audience = r.audience ?? 'all';
  const [a] = await dbs.owner.insert(kbArticle).values({
    level, agencyId: level === 'platform' ? null : (r.agencyId ?? IDS.agencyA), clientId: null, kind: 'help',
    title: r.title ?? `${level}/${audience}`, bodyMd: r.body ?? BODY(`${level}/${audience}`), status: r.status ?? 'published',
    clientVisible: audience === 'all' || audience === 'client', source: 'manual', createdBy: 't', updatedBy: 't',
    helpKey: r.helpKey ?? 'page:client.overview', audience,
  }).returning();
  return a!.id;
}

const get = (c: AccessContext, input: Record<string, unknown>) => registry.invoke(c, 'get_page_guide', { helpKey: 'page:client.overview', ...input }) as Promise<Guide>;
const list = (c: AccessContext, input: Record<string, unknown>) => registry.invoke(c, 'list_help_guides', input) as Promise<GuideList>;
const forClient = { context: 'client', clientId: IDS.clientA1 };

beforeEach(async () => {
  await resetWorkspace();
  await truncateAuth(dbs.owner);
  await seedUser(dbs.owner, 'op', 'op@example.com');
});

describe('get_page_guide resolution', () => {
  it('picks the exact-audience row per viewer; clients never get agency or operator rows', async () => {
    await guide({ audience: 'all' });
    const agencyRow = await guide({ audience: 'agency' });
    const opRow = await guide({ audience: 'operator' });
    const clientRow = await guide({ audience: 'client' });
    for (const c of [owner, viewer]) expect((await get(c, forClient))!.id).toBe(clientRow);
    expect((await get(admin, { context: 'agency' }))!.id).toBe(agencyRow);
    expect((await get(am, forClient))!.id).toBe(agencyRow);
    expect((await get(op, { context: 'platform' }))!.id).toBe(opRow);
  });

  it('a client gets null when only agency and operator rows exist', async () => {
    await guide({ audience: 'agency' });
    await guide({ audience: 'operator' });
    expect(await get(owner, forClient)).toBeNull();
    expect(await get(viewer, forClient)).toBeNull();
  });

  it('an agency viewer never gets an operator row', async () => {
    await guide({ audience: 'operator' });
    expect(await get(admin, { context: 'agency' })).toBeNull();
    expect(await get(admin, forClient)).toBeNull();
  });

  it('exact audience beats all', async () => {
    const all = await guide({ audience: 'all' });
    expect((await get(viewer, forClient))!.id).toBe(all);
    const exact = await guide({ audience: 'client' });
    expect((await get(viewer, forClient))!.id).toBe(exact);
    expect((await get(admin, { context: 'agency' }))!.id).toBe(all);
  });

  it("the caller agency's agency-level row beats platform rows, even an exact-audience one; other agencies' rows never apply", async () => {
    await guide({ audience: 'client' });
    const mine = await guide({ level: 'agency', audience: 'all' });
    const foreign = await guide({ level: 'agency', agencyId: IDS.agencyB, audience: 'all' });
    expect((await get(viewer, forClient))!.id).toBe(mine);
    expect((await get(adminB, { context: 'agency' }))!.id).toBe(foreign);
  });

  it('null when no row matches (unknown key, drafts, non-guide rows)', async () => {
    await guide({ audience: 'all', status: 'draft' });
    await guide({ helpKey: 'page:client.changes', audience: 'all' });
    expect(await get(viewer, forClient)).toBeNull();
    expect(await get(admin, { context: 'agency', helpKey: 'page:nope' })).toBeNull();
  });

  it('rejects malformed keys (glossary or arbitrary text)', async () => {
    for (const helpKey of ['glossary:pressure', 'page:Bad Key', 'client.overview']) {
      await expect(get(admin, { context: 'agency', helpKey })).rejects.toMatchObject({ code: 'invalid_input' });
    }
  });

  it('splits the body into its H2 sections (fence-aware)', async () => {
    await guide({ audience: 'all' });
    const g = (await get(admin, { context: 'agency' }))!;
    expect(g.sections.map((s) => s.heading)).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
    expect(g.sections[1]!.markdown).toContain('## not a heading');
    expect(g.sections[2]!.markdown).toBe('**Why?** Because.');
  });
});

describe('get_page_guide access', () => {
  it('platform context is operator-only; anyone else gets not_found', async () => {
    await guide({ audience: 'operator' });
    for (const c of [admin, owner, viewer]) await expect(get(c, { context: 'platform' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(list(admin, { context: 'platform' })).rejects.toMatchObject({ code: 'not_found' });
    expect((await get(op, { context: 'platform' }))!.title).toBe('platform/operator');
  });

  it("platform context ignores the operator's own agency-level rows", async () => {
    const opRow = await guide({ audience: 'operator' });
    await guide({ level: 'agency', audience: 'all', title: 'ours' });
    const opListed = await guide({ audience: 'operator', helpKey: 'page:platform.agencies' });
    await guide({ level: 'agency', audience: 'all', helpKey: 'page:platform.agencies', title: 'ours only' });
    expect((await get(op, { context: 'platform' }))!.id).toBe(opRow);
    expect((await list(op, { context: 'platform' })).guides).toEqual([{ helpKey: 'page:platform.agencies', title: 'platform/operator', articleId: opListed }]);
    expect((await get(op, { context: 'agency' }))!.title).toBe('ours');
  });

  it('a foreign or missing client is not_found', async () => {
    await guide({ audience: 'all' });
    await expect(get(viewer, { context: 'client', clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(get(am, { context: 'client', clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(get(admin, { context: 'client', clientId: IDS.clientB1 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(get(admin, { context: 'client' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(list(viewer, { context: 'client', clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_page_guide names', () => {
  it('renders the white-label names and the client name', async () => {
    await dbs.owner.update(agency).set({ branding: { displayName: 'Acme Intel', assistantName: 'Ace' } as never }).where(eq(agency.id, IDS.agencyA));
    await guide({ audience: 'all', title: 'About {{product}}' });
    const g = (await get(viewer, forClient))!;
    expect(g.title).toBe('About Acme Intel');
    expect(g.sections[0]!.markdown).toBe('platform/all overview for Acme Intel.');
    expect(g.sections[1]!.markdown).toContain('Ask Ace about A1 HVAC.');
    expect(JSON.stringify(g)).not.toMatch(/\{\{|Rival Monday|Friday/);
  });

  it('client audience never falls back to Rival Monday; agency audience does', async () => {
    await guide({ audience: 'all' });
    expect((await get(viewer, forClient))!.sections[0]!.markdown).toBe('platform/all overview for your agency.');
    expect((await get(admin, { context: 'agency' }))!.sections[0]!.markdown).toBe('platform/all overview for Rival Monday.');
  });

  it('{{client}} without a client name: "your business" for clients is never used for agency staff or operators', async () => {
    await guide({ audience: 'all' });
    await guide({ audience: 'all', helpKey: 'page:agency.portfolio' });
    expect((await get(admin, { context: 'agency' }))!.sections[1]!.markdown).toContain('about the client');
    expect((await get(op, { context: 'platform' }))!.sections[1]!.markdown).toContain('about the client');
    expect((await get(admin, { context: 'agency', helpKey: 'page:agency.portfolio' }))!.sections[1]!.markdown).toContain('about the client');
    expect((await get(admin, forClient))!.sections[1]!.markdown).toContain('about A1 HVAC');
  });
});

describe('list_help_guides', () => {
  it('one entry per page key with the preferred row; glossary keys excluded; audience-filtered', async () => {
    await guide({ helpKey: 'page:client.overview', audience: 'all', title: 'Overview (all)' });
    const exact = await guide({ helpKey: 'page:client.overview', audience: 'client', title: 'Overview for {{client}}' });
    await guide({ helpKey: 'page:agency.portfolio', audience: 'agency', title: 'Portfolio' });
    await guide({ helpKey: 'page:platform.agencies', audience: 'operator', title: 'Agencies' });
    await guide({ helpKey: 'glossary:pressure', audience: 'all', title: 'Pressure' });
    const mine = await guide({ helpKey: 'page:client.changes', level: 'agency', audience: 'all', title: 'Changes (ours)' });
    await guide({ helpKey: 'page:client.changes', audience: 'client', title: 'Changes (platform)' });

    expect((await list(viewer, forClient)).guides).toEqual([
      { helpKey: 'page:client.changes', title: 'Changes (ours)', articleId: mine },
      { helpKey: 'page:client.overview', title: 'Overview for A1 HVAC', articleId: exact },
    ]);
    expect((await list(admin, forClient)).guides.map((g) => [g.helpKey, g.title])).toEqual([
      ['page:client.changes', 'Changes (ours)'], ['page:client.overview', 'Overview (all)'],
    ]);
    expect((await list(admin, { context: 'agency' })).guides.map((g) => [g.helpKey, g.title])).toEqual([['page:agency.portfolio', 'Portfolio']]);
    expect((await list(op, { context: 'platform' })).guides.map((g) => g.helpKey)).toEqual(['page:platform.agencies']);
  });

  it("lists only the context's own area: client pages in client context, agency pages in agency context, platform pages in platform context", async () => {
    for (const helpKey of ['page:client.overview', 'page:agency.portfolio', 'page:platform.agencies', 'page:account.profile']) await guide({ helpKey, audience: 'all' });
    expect((await list(admin, forClient)).guides.map((g) => g.helpKey)).toEqual(['page:client.overview']);
    expect((await list(viewer, forClient)).guides.map((g) => g.helpKey)).toEqual(['page:client.overview']);
    expect((await list(admin, { context: 'agency' })).guides.map((g) => g.helpKey)).toEqual(['page:agency.portfolio']);
    expect((await list(op, { context: 'platform' })).guides.map((g) => g.helpKey)).toEqual(['page:platform.agencies']);
  });
});
