import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, withDatabase } from '@cs/db';
import { demoSignInLinks } from '@cs/demo';
import { type BrowserContext, test } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { shotsLabel } from '../scripts/shots-index';
import { auditPage, type PageAudit } from './crawl-audit';
import { type CrawlAs, type CrawlFx, CRAWL_ROUTES, CRAWL_VIEWPORTS } from './crawl-routes';

const ROOT = fileURLToPath(new URL('../.shots', import.meta.url));
const DIR = join(ROOT, `${shotsLabel(process.env.SHOTS_LABEL)}-crawl`);
const AUDIT = join(DIR, 'audit.json');
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // Env may come from the shell.
}

test.describe.configure({ mode: 'serial' });

const contexts: Partial<Record<CrawlAs, BrowserContext>> = {};
let fx: CrawlFx;
const only = process.env.CRAWL_ONLY ? new RegExp(process.env.CRAWL_ONLY) : null;

test.beforeAll(async ({ browser }, info) => {
  info.setTimeout(240_000);
  const baseURL = info.project.use.baseURL!;
  if (!only) rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const { db, close } = createDb(withDatabase(process.env.DATABASE_URL!, 'cs_demo'));
  const one = async (q: ReturnType<typeof sql>) => {
    try {
      return [...(await db.execute<{ id: string }>(q))][0]?.id ?? null;
    } catch {
      return null;
    }
  };
  try {
    const clientId = (await one(sql`select id from client where name like 'Lone Star%'`))!;
    const briefId = await one(sql`select id from brief where client_id = ${clientId} and status = 'sent' order by delivery_date desc limit 1`);
    fx = {
      clientId,
      setupClientId: await one(sql`select id from client where name like 'Cedar Creek%'`),
      prospectId: await one(sql`select id from client where status = 'prospect' limit 1`),
      competitorId: await one(sql`select competitor_id as id from client_competitor where client_id = ${clientId} limit 1`),
      briefId,
      readyBriefId: await one(sql`select id from brief where status = 'ready' limit 1`),
      alertId: await one(sql`select id from alert where client_id = ${clientId} order by created_at desc limit 1`),
      reportId: await one(sql`select id from trend_report where client_id = ${clientId} limit 1`),
      evidenceId: briefId ? await one(sql`select evidence_ids ->> 0 as id from brief_item where brief_id = ${briefId} and jsonb_array_length(evidence_ids) > 0 limit 1`) : null,
      threadId: await one(sql`select id from ask_thread where client_id = ${clientId} limit 1`),
      kbId: await one(sql`select id from kb_article limit 1`),
      agencyId: await one(sql`select agency_id as id from client where id = ${clientId}`),
    };
    const links = await demoSignInLinks(db, { secret: process.env.LINK_SIGNING_SECRET!, baseUrl: baseURL });
    for (const [as, key] of [['operator', 'Platform operator'], ['agency', 'Agency admin'], ['owner', 'Client owner — Lone Star']] as const) {
      const link = links.find((l) => l.label.startsWith(key));
      if (!link) throw new Error(`crawl: no demo link for ${key}`);
      const ctx = await browser.newContext({ baseURL });
      const page = await ctx.newPage();
      await page.goto(link.url, { timeout: 180_000 });
      await page.waitForLoadState('load');
      await page.close();
      contexts[as] = ctx;
    }
    contexts['signed-out'] = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  } finally {
    await close();
  }
});

test.afterAll(async () => {
  for (const c of Object.values(contexts)) await c?.close();
});

const audits = (): PageAudit[] => {
  try {
    return JSON.parse(readFileSync(AUDIT, 'utf8')) as PageAudit[];
  } catch {
    return [];
  }
};

for (const route of CRAWL_ROUTES) {
  if (only && !only.test(route.label)) continue;
  for (const vp of CRAWL_VIEWPORTS) {
    if (vp.width === 1920 && !route.wide) continue;
    test(`${route.label} @ ${vp.width}`, async () => {
      const path = route.path(fx);
      test.skip(path === null, 'fixture missing');
      const page = await contexts[route.as]!.newPage();
      try {
        await page.setViewportSize(vp);
        const res = await page.goto(path!, { timeout: 180_000 });
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
        await page.screenshot({ path: join(DIR, `${route.label}-${vp.width}.png`), fullPage: true });
        const audit = await page.evaluate(auditPage);
        const row: PageAudit = { ...audit, label: route.label, as: route.as, width: vp.width, status: res?.status() ?? 0, url: path! };
        writeFileSync(AUDIT, JSON.stringify([...audits().filter((a) => !(a.label === route.label && a.width === vp.width)), row], null, 1));
      } finally {
        await page.close();
      }
    });
  }
}
