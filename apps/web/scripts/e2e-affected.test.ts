import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { grepFor, KNOWN_TAGS, matchRule, parseSpecTests, resolveAffected, RULES, specTagsFrom } from './e2e-affected-rules';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const REPO = join(WEB, '..', '..');
const E2E = join(WEB, 'e2e');
const SPECS = Object.fromEntries(
  readdirSync(E2E)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => [f, readFileSync(join(E2E, f), 'utf8')]),
);
const SPEC_TAGS = specTagsFrom(SPECS);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}
const repoPath = (abs: string) => relative(REPO, abs).split('\\').join('/');

describe('resolveAffected', () => {
  const resolve = (...files: string[]) => resolveAffected(files, SPEC_TAGS);

  it('needs no E2E for docs-only, unit-test, worker and e2e-panel changes', () => {
    expect(resolve('docs/STATE.md', 'apps/web/CLAUDE.md', 'docs/work/x.md').mode).toBe('none');
    expect(resolve('apps/web/src/server/format.test.ts', 'apps/worker/src/index.ts', 'apps/web/e2e-panel/panel.spec.ts').mode).toBe('none');
    expect(resolve('apps/web/scripts/admin.ts').mode).toBe('none');
    expect(resolve().mode).toBe('none');
  });

  it('runs a pricing page change as @pricing plus @smoke', () => {
    expect(resolve('apps/web/src/app/(app)/c/[clientId]/pricing/price-card.tsx')).toMatchObject({ mode: 'some', tags: ['@pricing', '@smoke'] });
  });

  it('maps a tools pricing file to @pricing', () => {
    expect(resolve('packages/tools/src/tools/pricing.ts')).toMatchObject({ mode: 'some', tags: ['@pricing', '@smoke'] });
  });

  it('maps package files by keyword, most specific first', () => {
    expect(resolve('packages/tools/src/tools/alert-rules.ts').tags).toEqual(['@alert-rules', '@smoke']);
    expect(resolve('packages/tools/src/tools/alert-queue.ts').tags).toEqual(['@alerts', '@smoke']);
    expect(resolve('packages/tools/src/workspace/word-diff.ts').tags).toEqual(['@changes', '@evidence', '@smoke']);
    expect(resolve('packages/collectors/src/ads/meta.ts').tags).toEqual(['@ads', '@smoke']);
    expect(resolve('packages/engine/src/briefs/review.ts').tags).toEqual(['@briefs', '@recommendations', '@smoke']);
    expect(resolve('packages/email/src/templates/sign-in.tsx').tags).toEqual(['@auth', '@smoke']);
  });

  it('maps AI-connection paths to @ai-connections and settings/ai off the delivery rule', () => {
    for (const f of [
      'packages/mcp/src/handler.ts', 'apps/web/src/app/mcp/route.ts', 'apps/web/src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts', 'apps/web/src/app/oauth/consent/page.tsx',
      'apps/web/src/app/(app)/c/[clientId]/settings/ai/page.tsx', 'apps/web/src/app/(app)/agency/ai/page.tsx', 'apps/web/src/server/mcp.ts', 'apps/web/src/server/oauth-consent.ts',
      'apps/web/src/server/ai-connections.ts', 'apps/web/src/components/ai-connections.tsx', 'packages/tools/src/tools/api-tokens.ts', 'packages/tools/src/access/oauth.ts',
    ]) {
      expect(resolve(f), f).toMatchObject({ mode: 'some', tags: ['@ai-connections', '@smoke'] });
      expect(matchRule(f).why, f).toMatch(/AI connections/);
    }
    expect(matchRule('apps/web/src/app/(app)/c/[clientId]/settings/delivery/page.tsx').why).toMatch(/settings page/);
  });

  it('maps Ask paths to @ask (platform Ask review also to @platform)', () => {
    for (const f of [
      'packages/ask/src/turn.ts', 'packages/ask/package.json', 'apps/web/src/app/api/ask/turn/route.ts', 'apps/web/src/app/(app)/c/[clientId]/ask/ask-screen.tsx',
      'apps/web/src/components/ask/answer.tsx', 'packages/tools/src/tools/ask-threads.ts', 'packages/tools/src/ask-tools.ts', 'packages/demo/src/ask.ts',
    ]) {
      expect(resolve(f), f).toMatchObject({ mode: 'some', tags: ['@ask', '@smoke'] });
    expect(resolve('apps/web/src/server/ask.ts')).toMatchObject({ mode: 'some', tags: ['@ask', '@kb', '@smoke'] });
    }
    expect(resolve('apps/web/src/app/(platform)/platform/ask/[threadId]/page.tsx')).toMatchObject({ mode: 'some', tags: ['@ask', '@platform', '@smoke'] });
    expect(resolve('packages/engine/src/tasks/run.ts').mode).toBe('all');
  });

  it('maps the platform console files to @platform', () => {
    for (const f of ['packages/tools/src/tools/platform-console.ts', 'packages/tools/src/platform/stats.ts', 'packages/demo/src/platform-stats.ts', 'apps/web/src/app/(platform)/platform/agencies/page.tsx']) {
      expect(resolve(f).tags, f).toContain('@platform');
      expect(resolve(f).mode, f).toBe('some');
    }
  });

  it('runs everything for an unknown package file, a migration, or a shared foundation', () => {
    expect(resolve('packages/tools/src/registry.ts').mode).toBe('all');
    expect(resolve('packages/email/src/render.ts').mode).toBe('all');
    expect(resolve('packages/db/migrations/0050_x.sql').mode).toBe('all');
    expect(resolve('packages/db/src/schema/clients.ts').mode).toBe('all');
    expect(resolve('apps/web/src/components/shell/sidebar.tsx').mode).toBe('all');
    expect(resolve('apps/web/e2e/seed.ts').mode).toBe('all');
    expect(resolve('pnpm-lock.yaml').mode).toBe('all');
    expect(resolve('apps/web/src/server/brand-new.ts').mode).toBe('all');
    expect(resolve('docs/x.md', 'packages/core/src/index.ts', 'apps/web/src/app/(app)/c/[clientId]/ads/page.tsx')).toMatchObject({ mode: 'all', tags: ['@ads', '@smoke'] });
  });

  it("runs a changed spec's own tags", () => {
    expect(resolve('apps/web/e2e/workspace.spec.ts')).toEqual({
      mode: 'some',
      tags: ['@alert-rules', '@changes', '@competitors', '@evidence', '@moves', '@overview', '@responsive', '@smoke'],
      reasons: [expect.stringContaining('workspace.spec.ts')],
    });
    expect(resolve('apps/web/e2e/new.spec.ts').mode).toBe('all');
  });

  it('runs only @smoke for a page no test covers', () => {
    expect(resolve('apps/web/src/app/(app)/agency/team/page.tsx')).toMatchObject({ mode: 'some', tags: ['@smoke'] });
  });

  it('builds a grep that does not match longer tags', () => {
    const g = new RegExp(grepFor(['@ads', '@smoke']));
    expect(g.test('ads lists creatives @ads')).toBe(true);
    expect(g.test('x @ads-extra')).toBe(false);
    expect(g.test('x @smoke @auth')).toBe(true);
  });
});

describe('parseSpecTests', () => {
  it('reads titles and tags, and reports untagged tests', () => {
    const src = `test('a', { tag: ['@x', "@y"] }, async () => {});\n  test("b \\"q\\"", async () => {});\ntest.fixme('c', { tag: ['@z'] }, async () => {});`;
    expect(parseSpecTests(src)).toEqual([
      { title: 'a', tags: ['@x', '@y'] },
      { title: 'b \\"q\\"', tags: null },
      { title: 'c', tags: ['@z'] },
    ]);
  });
});

describe('coverage guard', () => {
  const tests = Object.entries(SPECS).flatMap(([file, src]) => parseSpecTests(src).map((t) => ({ file, ...t })));
  const used = new Set(tests.flatMap((t) => t.tags ?? []));

  it('finds the spec tests', () => {
    expect(tests.length).toBeGreaterThanOrEqual(27);
    // Every `test(` call in the specs was parsed (none missed by the regex).
    const calls = Object.values(SPECS).reduce((n, s) => n + (s.match(/^\s*test(?:\.(?:only|fixme|skip|fail|slow))?\(\s*['"`]/gm)?.length ?? 0), 0);
    expect(tests.length).toBe(calls);
  });

  it('gives every test a non-empty list of known tags', () => {
    for (const t of tests) {
      expect(t.tags, `${t.file}: ${t.title}`).not.toBeNull();
      expect(t.tags!.length, `${t.file}: ${t.title}`).toBeGreaterThan(0);
      for (const tag of t.tags!) expect(KNOWN_TAGS, `${t.file}: ${t.title}`).toContain(tag);
    }
  });

  it('keeps @smoke on exactly the two always-run tests', () => {
    expect(tests.filter((t) => t.tags?.includes('@smoke')).map((t) => t.title)).toEqual([
      expect.stringMatching(/^an invited admin signs in/),
      expect.stringMatching(/^a client opens a signed email link/),
    ]);
  });

  it('has no dead tags: every tag a rule names is carried by a test', () => {
    for (const rule of RULES) {
      if (!Array.isArray(rule.tags)) continue;
      for (const tag of rule.tags) expect(used, `${rule.pattern} → ${tag}`).toContain(tag);
    }
  });

  it('gives every web route, component and dev-panel file a specific rule (not a catch-all)', () => {
    const files = ['src/app', 'src/components', 'src/dev-panel']
      .flatMap((d) => walk(join(WEB, d)))
      .map(repoPath)
      .filter((f) => !/\.test\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(50);
    const unmatched = files.filter((f) => matchRule(f).fallback);
    expect(unmatched, 'add a rule in scripts/e2e-affected-rules.ts').toEqual([]);
  });
});
