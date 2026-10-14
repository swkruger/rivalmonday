import { eq, inArray, sql } from 'drizzle-orm';
import { platformCostItem, platformCostService, platformCostSnapshot } from '@cs/db';
import type { SeedContext } from './context';

const DAY = 86_400_000;
const DEMO_BY = 'demo-seed';
const FIRST_OF_MONTH = (now: Date, monthsBack: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1)).toISOString().slice(0, 10);

/**
 * Phase 8c: the platform costs page. 14 days of OpenRouter and DataForSEO balances (DataForSEO ends at $8.20, under its
 * $10 low threshold, so the page shows one Low service and the warning strip) and three manual costs. Idempotent: the
 * demo's snapshots and items are replaced, and the six service rows are upserted defensively (migration 0051 normally
 * seeds them) so a re-seed leaves exactly one set.
 */
export async function seedPlatformCosts(ctx: SeedContext): Promise<void> {
  const now = ctx.clock.now;
  await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into platform_cost_service (service, billing_url) values
        ('openrouter','https://openrouter.ai/settings/credits'), ('dataforseo','https://app.dataforseo.com/billing'),
        ('scrapecreators','https://app.scrapecreators.com'), ('apify','https://console.apify.com/billing'),
        ('anthropic','https://platform.claude.com/settings/billing'), ('neon','https://console.neon.tech/app/billing')
      on conflict do nothing`);
    await tx.update(platformCostService).set({ lowThresholdUsd: '10.00' }).where(eq(platformCostService.service, 'dataforseo'));

    await tx.delete(platformCostSnapshot).where(inArray(platformCostSnapshot.service, ['openrouter', 'dataforseo']));
    const rows = [];
    for (let d = 13; d >= 0; d--) {
      const takenAt = new Date(now.getTime() - d * DAY);
      rows.push({ service: 'openrouter' as const, takenAt, status: 'ok' as const, kind: 'balance' as const, amountUsd: (38 + d * 1.6).toFixed(4) });
      rows.push({ service: 'dataforseo' as const, takenAt, status: 'ok' as const, kind: 'balance' as const, amountUsd: (8.2 + d * 0.25).toFixed(4) });
    }
    await tx.insert(platformCostSnapshot).values(rows);

    await tx.delete(platformCostItem).where(eq(platformCostItem.createdBy, DEMO_BY));
    await tx.insert(platformCostItem).values([
      { name: 'Vercel Pro', kind: 'recurring', amountUsd: '20.00', period: 'monthly', startsOn: FIRST_OF_MONTH(now, 3), billingUrl: 'https://vercel.com/account/billing', createdBy: DEMO_BY },
      { name: 'Namecheap domain', kind: 'recurring', amountUsd: '15.00', period: 'yearly', startsOn: FIRST_OF_MONTH(now, 5), billingUrl: 'https://ap.www.namecheap.com/domains/list', createdBy: DEMO_BY },
      { name: 'Worker host', kind: 'recurring', amountUsd: '7.00', period: 'monthly', startsOn: FIRST_OF_MONTH(now, 3), createdBy: DEMO_BY },
    ]);
  });
}
