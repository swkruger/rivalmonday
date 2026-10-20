import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AccessContext, GLOSSARY } from '@cs/core';
import { kbArticle } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { isNotNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ctx, dbs, registry, resetWorkspace } from '../tools/workspace-fixtures';
import { seedKnowledge } from './seed';

/**
 * 15b-1 pilot content: `seedKnowledge` over the real `docs/help` folder and the real `GLOSSARY` (the `pnpm kb:seed` path),
 * then the help tools read it back per audience. Guards the owner-facing copy against validation errors and audience leaks.
 */
const DOCS = join(dirname(fileURLToPath(import.meta.url)), '../../../../docs/help');
const PILOT = ['page:client.changes#agency', 'page:client.changes#client', 'page:client.overview#agency', 'page:client.overview#client', 'page:client.reviews#agency', 'page:client.reviews#client'];
/**
 * Words a client must never read in help: agency-internal concepts and the product name (client-facing text falls back to
 * "your agency"). The default assistant name is fine once rendered (it is what an un-renamed assistant is called); the
 * seed lint keeps it out of the source text.
 */
const AGENCY_ONLY = /\brout(e|ed|ing)\b|upsell|\bseats?\b|AM check|place id|prospect|pitch|approval|rival\s*monday/i;

type Guide = { id: string; title: string; sections: { heading: string; markdown: string }[] } | null;
const owner = ctx('client_owner', [IDS.clientA1]);
const viewer = ctx('client_viewer', [IDS.clientA1]);
const admin = ctx('agency_admin', 'all');
const am = ctx('account_manager', [IDS.clientA1]);
const guide = (c: AccessContext, helpKey: string) => registry.invoke(c, 'get_page_guide', { helpKey, context: 'client', clientId: IDS.clientA1 }) as Promise<Guide>;
const text = (g: Guide) => (g ? [g.title, ...g.sections.flatMap((s) => [s.heading, s.markdown])].join('\n') : '');

beforeEach(async () => {
  await resetWorkspace();
  await seedKnowledge(dbs.service, DOCS, 'system:seed', { glossary: GLOSSARY });
});

describe('help content (real docs/help + GLOSSARY)', () => {
  it('seeds with no validation errors: the pilot guides and one row per glossary term', async () => {
    const rows = await dbs.service.select({ seedKey: kbArticle.seedKey, helpKey: kbArticle.helpKey, audience: kbArticle.audience, clientVisible: kbArticle.clientVisible })
      .from(kbArticle).where(isNotNull(kbArticle.helpKey));
    const keys = rows.map((r) => r.seedKey!);
    expect(keys.filter((k) => k.startsWith('page:')).sort()).toEqual(PILOT);
    expect(keys.filter((k) => k.startsWith('glossary:')).sort()).toEqual(GLOSSARY.map((t) => `glossary:${t.id}#${t.audience}`).sort());
    for (const r of rows) expect(r.clientVisible, r.seedKey!).toBe(r.audience === 'all' || r.audience === 'client');
    // A second run changes nothing.
    expect(await seedKnowledge(dbs.service, DOCS, 'system:seed', { glossary: GLOSSARY })).toMatchObject({ created: 0, updated: 0, removed: 0 });
  });

  it('client roles get the client version, agency roles the agency version', async () => {
    for (const key of ['page:client.overview', 'page:client.changes', 'page:client.reviews']) {
      const [o, v, a, m] = await Promise.all([guide(owner, key), guide(viewer, key), guide(admin, key), guide(am, key)]);
      expect(o!.id, key).toBe(v!.id);
      expect(a!.id, key).toBe(m!.id);
      expect(a!.id, key).not.toBe(o!.id);
    }
    const [o, a] = await Promise.all([guide(owner, 'page:client.reviews'), guide(admin, 'page:client.reviews')]);
    for (const g of [o, a]) expect(g!.sections.map((s) => s.heading)).toEqual(['What this page tells you', 'How to use it', 'Common questions']);
  });

  it('list_help_guides gives both audiences the three pilot pages', async () => {
    for (const c of [owner, admin]) {
      const { guides } = (await registry.invoke(c, 'list_help_guides', { context: 'client', clientId: IDS.clientA1 })) as { guides: { helpKey: string }[] };
      expect(guides.map((g) => g.helpKey).sort(), c.role).toEqual(['page:client.changes', 'page:client.overview', 'page:client.reviews']);
    }
  });

  it('nothing a client reads names agency-internal concepts or the product, and every placeholder is filled', async () => {
    for (const key of ['page:client.overview', 'page:client.changes', 'page:client.reviews']) {
      const t = text(await guide(owner, key));
      expect(t, key).not.toMatch(AGENCY_ONLY);
      expect(t, key).not.toContain('{{');
    }
    for (const t of GLOSSARY.filter((x) => x.audience === 'all' || x.audience === 'client')) expect(`${t.term}\n${t.short}\n${t.long ?? ''}`, t.id).not.toMatch(AGENCY_ONLY);
  });

  it('the client Changes guide leaves out the alert caps (owner 2026-10-20) that the agency guide keeps', async () => {
    expect(text(await guide(owner, 'page:client.changes'))).not.toMatch(/3 a day|7 days|3 instant/i);
    expect(text(await guide(admin, 'page:client.changes'))).toMatch(/3 instant alerts/);
  });

  it('the agency versions cover what agency staff need', async () => {
    const overview = text(await guide(admin, 'page:client.overview'));
    for (const w of ['Upsell', 'Approvals', 'Pitch snapshot', 'Settings › Delivery', 'place id']) expect(overview, w).toContain(w);
    const changes = text(await guide(admin, 'page:client.changes'));
    for (const w of ['routing', 'Settings › Alert rules', 'Archived']) expect(changes, w).toContain(w);
    const reviews = text(await guide(admin, 'page:client.reviews'));
    expect(reviews).toContain('Settings › Business profile');
    expect(`${overview}\n${changes}\n${reviews}`).not.toContain('{{');
  });
});
