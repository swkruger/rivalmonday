import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AccessContext, ToolError } from '@cs/core';
import { databaseNameOf } from '@cs/db';
import { openTestDbs, testUrls } from '@cs/db/test-helpers';
import { createFsStore } from '@cs/storage';
import { accessContextFor, createToolRegistry, getAgencyBranding, listInbox, listMemberships, listTeam, listWebhooks, myNotificationSettings } from '@cs/tools';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseRoute, isNonEmpty, NO_DATA_ROUTES, pathExists, README_MARKERS, renderCoverageTable, SCREENS, SHARED_READS, toolReadsOf, valueAt } from './coverage';
import type { DemoIds } from './ids';
import { seedDemo } from './seed';
import { resetDemoTables, TEST_SALT } from './test-support';
import { DEMO_OPERATOR_EMAIL, type DemoUserKey } from './users';

const dbs = openTestDbs();
const evidenceDir = mkdtempSync(join(tmpdir(), 'demo-evidence-'));
const store = createFsStore(evidenceDir);
afterAll(async () => {
  await dbs.closeAll();
  rmSync(evidenceDir, { recursive: true, force: true });
});

const registry = createToolRegistry(
  { app: dbs.app, service: dbs.service, platformAdmins: [DEMO_OPERATOR_EMAIL], jobStatus: async () => null },
  { audit: { record: async () => {} } },
);
let ids: DemoIds;
const contexts = new Map<DemoUserKey, AccessContext>();

type Fn = (ctx: AccessContext, userId: string) => Promise<unknown>;
const FUNCTIONS: Record<string, Fn> = {
  'fn:getAgencyBranding': (ctx) => getAgencyBranding(dbs.service, ctx),
  'fn:listTeam': (ctx) => listTeam(dbs.service, ctx),
  'fn:listWebhooks': (ctx) => listWebhooks(dbs.service, ctx),
  'fn:listInbox': (_ctx, userId) => listInbox(dbs.service, { userId }),
  'fn:myNotificationSettings': (_ctx, userId) => myNotificationSettings(dbs.service, userId),
};

const softFail = (message: string) => expect.soft(true, message).toBe(false);

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  // Spec §8: the seed takes its expected database name; here it is the cs_test name.
  ids = await seedDemo({ ownerUrl: testUrls.owner, expected: databaseNameOf(testUrls.owner), store, salt: process.env.REVIEWER_HASH_SALT ?? TEST_SALT });
  for (const [key, u] of Object.entries(ids.users) as [DemoUserKey, DemoIds['users'][DemoUserKey]][]) {
    const [m] = await listMemberships(dbs.service, u.userId);
    contexts.set(key, await accessContextFor(dbs.service, u.userId, m!));
  }
});

describe('demo seed coverage (spec §4.9, §8)', () => {
  for (const screen of SCREENS) {
    it(`${screen.route} as ${screen.as}`, async () => {
      const ctx = contexts.get(screen.as)!;
      const userId = ids.users[screen.as].userId;
      for (const call of screen.calls) {
        const run = () => (call.tool.startsWith('fn:') ? FUNCTIONS[call.tool]!(ctx, userId) : registry.invoke(ctx, call.tool, call.input(ids)));
        const expectWhat = call.expect ?? 'data';
        // Failure messages name the screen, the tool and the output path, so a gap points at the seed area that owns it.
        const label = `${screen.route} as ${screen.as}: ${call.tool} → ${call.path ?? '(whole output)'}`;
        let out: unknown;
        try {
          out = await run();
        } catch (e) {
          const code = e instanceof ToolError ? e.code : 'error';
          expect.soft(code, `${label} threw: ${(e as Error).message}`).toBe(expectWhat === 'not_found' ? 'not_found' : 'no error');
          continue;
        }
        if (expectWhat === 'not_found') {
          softFail(`${label} should fail with not_found, but returned`);
          continue;
        }
        if (!pathExists(out, call.path)) {
          softFail(`${label}: no such path in the output (output keys: ${Object.keys(Object(out)).join(', ')})`);
          continue;
        }
        expect.soft(isNonEmpty(valueAt(out, call.path)), `${label} should ${expectWhat === 'data' ? 'return data' : 'be empty'}`).toBe(expectWhat === 'data');
      }
    });
  }

  const appDir = fileURLToPath(new URL('../../../apps/web/src/app/(app)', import.meta.url));
  const webSrc = fileURLToPath(new URL('../../../apps/web/src', import.meta.url));

  /** route -> tool names read by its page.tsx and the local modules it imports (server actions are writes, so skipped). */
  function pageReads(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    const moduleFile = (spec: string, from: string): string | null => {
      const base = spec.startsWith('@/') ? join(webSrc, spec.slice(2)) : resolve(from, spec);
      return ['.tsx', '.ts', '/index.tsx', '/index.ts'].map((ext) => base + ext).find((f) => existsSync(f)) ?? null;
    };
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === 'page.tsx') {
          const source = readFileSync(p, 'utf8');
          const imported = [...source.matchAll(/^import (?!type )[^;]*?from '((?:\.\.?\/|@\/)[^']+)'/gm)]
            .map((m) => m[1]!)
            .filter((spec) => !/\/actions$/.test(spec))
            .map((spec) => moduleFile(spec, dirname(p)))
            .filter((f): f is string => f !== null);
          const reads = new Set([source, ...imported.map((f) => readFileSync(f, 'utf8'))].flatMap(toolReadsOf));
          out.set(`/${relative(appDir, dir).split(sep).join('/')}`.replace(/\/$/, '') || '/', [...reads].sort());
        }
      }
    };
    walk(appDir);
    return out;
  }

  it('lists every app screen (a new screen needs a coverage entry and seed data)', () => {
    const covered = new Set([...SCREENS.map((s) => baseRoute(s.route)), ...NO_DATA_ROUTES]);
    expect([...pageReads().keys()].filter((r) => !covered.has(r)).sort()).toEqual([]);
  });

  it('checks every tool each page reads (a new read on a page needs a coverage call)', () => {
    const missing: string[] = [];
    for (const [route, reads] of pageReads()) {
      const checked = new Set(SCREENS.filter((s) => baseRoute(s.route) === route).flatMap((s) => s.calls.map((c) => c.tool)));
      for (const tool of reads) if (!checked.has(tool)) missing.push(`${route}: ${tool}`);
    }
    expect(missing, 'page reads with no coverage call').toEqual([]);
  });

  it('checks the reads of the shared (app) layout once, in the entry named in SHARED_READS', () => {
    const reads = toolReadsOf(readFileSync(join(appDir, 'layout.tsx'), 'utf8'));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.filter((t) => !(t in SHARED_READS)), 'layout reads missing from SHARED_READS').toEqual([]);
    for (const [tool, route] of Object.entries(SHARED_READS)) {
      expect(SCREENS.some((s) => s.route === route && s.calls.some((c) => c.tool === tool)), `${tool} is not called in ${route}`).toBe(true);
    }
  });

  it('keeps the README coverage table in sync with coverage.ts', () => {
    const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');
    const between = readme.slice(readme.indexOf(README_MARKERS.start) + README_MARKERS.start.length, readme.indexOf(README_MARKERS.end)).trim();
    expect(between).toBe(renderCoverageTable());
  });
});

describe('file routes outside (app): /files/brief, /files/report, /files/evidence', () => {
  const rows = async <T,>(query: ReturnType<typeof sql>) => [...(await dbs.owner.execute<T & Record<string, unknown>>(query))];

  it('stores a PDF for every sent brief and for the trend report', async () => {
    const pdfs = await rows<{ what: string; id: string; key: string | null }>(sql`
      select 'brief' as what, id::text, pdf_key as key from brief where status = 'sent'
      union all select 'report', id::text, pdf_key from trend_report where id = ${ids.reportId}`);
    expect(pdfs.filter((r) => r.what === 'brief').length).toBe(ids.briefs.sentLoneStar.length + ids.briefs.sentBrazos.length);
    expect(pdfs.filter((r) => r.what === 'report')).toHaveLength(1);
    const bad: string[] = [];
    for (const r of pdfs) {
      const bytes = r.key ? await store.get(r.key) : null;
      if (!bytes || Buffer.from(bytes.subarray(0, 4)).toString('latin1') !== '%PDF') bad.push(`${r.what} ${r.id}: ${r.key ? 'object missing or not a PDF' : 'no pdf_key'}`);
    }
    expect(bad).toEqual([]);
  });

  it('stores every evidence object of the seeded events', async () => {
    const eventIds = ids.events.map((e) => e.id);
    const linked = await rows<{ id: string; key: string }>(sql`
      select distinct ev.id::text, ev.object_key as key
      from event_change ec
      join detected_change dc on dc.id = ec.change_id
      join evidence ev on ev.capture_id in (dc.before_capture_id, dc.after_capture_id)
      where ec.event_id in (${sql.join(eventIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
    const listed = new Set(ids.events.flatMap((e) => e.evidenceIds));
    const found = new Set(linked.map((r) => r.id));
    expect([...listed].filter((id) => !found.has(id)), 'evidence ids in DemoIds that are not linked to their event').toEqual([]);
    const missing: string[] = [];
    for (const r of linked) if (!(await store.exists(r.key))) missing.push(`${r.id} (${r.key})`);
    expect(missing, 'evidence rows with no stored object').toEqual([]);
  });
});

describe('isNonEmpty', () => {
  it('treats nulls, zeros and all-null grids as empty', () => {
    expect([null, 0, '', [], [[null, null]], { a: null }, false].map(isNonEmpty)).toEqual([false, false, false, false, false, false, false]);
    expect([[[null, 21]], { a: [1] }, 'x', true, 3].map(isNonEmpty)).toEqual([true, true, true, true, true]);
  });
});

describe('toolReadsOf', () => {
  it('finds the tool names a page passes to callTool and tryCallTool', () => {
    const src = [
      "await callTool<{ items: X[] }>(ctx, 'list_moves', { clientId });",
      'const m = await tryCallTool<MoveDetail>(',
      '  ctx,',
      "  'get_move', {});",
      "callTool(ctx, 'list_moves', {})",
      "registry().invoke(ctx, 'not_a_page_read', {})",
    ].join('\n');
    expect(toolReadsOf(src)).toEqual(['get_move', 'list_moves']);
  });
});

describe('valueAt / pathExists', () => {
  const out = { rows: [{ name: 'A', cells: [{ prices: [] }] }, { name: 'B', cells: [{ prices: [79] }] }], report: { data: null } };
  it('maps a * segment over arrays', () => {
    expect(valueAt(out, 'rows.*.cells.*.prices')).toEqual([[[]], [[79]]]);
    expect(isNonEmpty(valueAt(out, 'rows.*.cells.*.prices'))).toBe(true);
    expect(isNonEmpty(valueAt({ rows: [{ cells: [] }] }, 'rows.*.cells.*.prices'))).toBe(false);
  });
  it('flags a path that does not match the output shape, not an empty value', () => {
    expect(pathExists(out, 'rows.*.cells.*.prices')).toBe(true);
    expect(pathExists(out, 'report.data.businesses')).toBe(true);
    expect(pathExists(out, 'rows.*.series')).toBe(false);
    expect(pathExists(out, 'items')).toBe(false);
  });
});
