import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AccessContext, ToolError } from '@cs/core';
import { databaseNameOf } from '@cs/db';
import { openTestDbs, testUrls } from '@cs/db/test-helpers';
import { createFsStore } from '@cs/storage';
import { accessContextFor, createToolRegistry, getAgencyBranding, listInbox, listMemberships, listTeam, listWebhooks, myNotificationSettings } from '@cs/tools';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseRoute, isNonEmpty, NO_DATA_ROUTES, pathExists, README_MARKERS, renderCoverageTable, SCREENS, valueAt } from './coverage';
import type { DemoIds } from './ids';
import { seedDemo } from './seed';
import { resetDemoTables, TEST_SALT } from './test-support';
import { DEMO_OPERATOR_EMAIL, type DemoUserKey } from './users';

const dbs = openTestDbs();
const evidenceDir = mkdtempSync(join(tmpdir(), 'demo-evidence-'));
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
  ids = await seedDemo({ ownerUrl: testUrls.owner, expected: databaseNameOf(testUrls.owner), store: createFsStore(evidenceDir), salt: process.env.REVIEWER_HASH_SALT ?? TEST_SALT });
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

  it('lists every app screen (a new screen needs a coverage entry and seed data)', () => {
    const appDir = fileURLToPath(new URL('../../../apps/web/src/app/(app)', import.meta.url));
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name === 'page.tsx') routes.push(`/${relative(appDir, dir).split(sep).join('/')}`.replace(/\/$/, '') || '/');
      }
    };
    walk(appDir);
    const covered = new Set([...SCREENS.map((s) => baseRoute(s.route)), ...NO_DATA_ROUTES]);
    expect(routes.filter((r) => !covered.has(r)).sort()).toEqual([]);
  });

  it('keeps the README coverage table in sync with coverage.ts', () => {
    const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');
    const between = readme.slice(readme.indexOf(README_MARKERS.start) + README_MARKERS.start.length, readme.indexOf(README_MARKERS.end)).trim();
    expect(between).toBe(renderCoverageTable());
  });
});

describe('isNonEmpty', () => {
  it('treats nulls, zeros and all-null grids as empty', () => {
    expect([null, 0, '', [], [[null, null]], { a: null }, false].map(isNonEmpty)).toEqual([false, false, false, false, false, false, false]);
    expect([[[null, 21]], { a: [1] }, 'x', true, 3].map(isNonEmpty)).toEqual([true, true, true, true, true]);
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
