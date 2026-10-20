import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { kbArticle } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const base = { kind: 'help' as const, bodyMd: 'body', source: 'manual' as const, createdBy: 'u', updatedBy: 'u', title: 't' };
const platform = { ...base, level: 'platform' as const, helpKey: 'dashboard' };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('kb_article help_key / audience', () => {
  it('defaults audience to all and help_key to null', async () => {
    const [row] = await dbs.service.insert(kbArticle).values({ ...base, level: 'platform' }).returning();
    expect(row!.audience).toBe('all');
    expect(row!.helpKey).toBeNull();
  });

  it('check constraint rejects an unknown audience', async () => {
    const err = await errorText(dbs.service.insert(kbArticle).values({ ...platform, audience: 'staff' as never }));
    expect(err).toContain('kb_article_audience_check');
  });

  it('rejects a second platform row with the same key and audience', async () => {
    await dbs.service.insert(kbArticle).values({ ...platform, audience: 'agency' });
    const err = await errorText(dbs.service.insert(kbArticle).values({ ...platform, audience: 'agency' }));
    expect(err).toContain('kb_article_help_key_uq');
  });

  it('allows a different audience and an agency-level row with the same key', async () => {
    await dbs.service.insert(kbArticle).values({ ...platform, audience: 'agency' });
    await dbs.service.insert(kbArticle).values({ ...platform, audience: 'client' });
    await dbs.service.insert(kbArticle).values({ ...base, level: 'agency', agencyId: IDS.agencyA, helpKey: 'dashboard', audience: 'agency' });
    const err = await errorText(
      dbs.service.insert(kbArticle).values({ ...base, level: 'agency', agencyId: IDS.agencyA, helpKey: 'dashboard', audience: 'agency' }),
    );
    expect(err).toContain('kb_article_help_key_uq');
  });

  it('does not constrain rows without a help_key', async () => {
    await dbs.service.insert(kbArticle).values({ ...base, level: 'platform' });
    await dbs.service.insert(kbArticle).values({ ...base, level: 'platform' });
  });
});
