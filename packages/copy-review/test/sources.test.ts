import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectScanned } from '../src/collect.js';
import { scanTsFile } from '../src/scan/ts-scan.js';
import { ruleFor, SOURCES, surfaceFor } from '../src/sources.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');

describe('surfaceFor', () => {
  it('surfaceFor maps route groups', () => {
    const table: [string, string | null][] = [
      ['apps/web/src/app/(app)/c/[clientId]/brief/page.tsx', 'app-client'],
      ['apps/web/src/app/(onboarding)/c/[clientId]/setup/page.tsx', 'app-client'],
      ['apps/web/src/app/(app)/agency/clients/page.tsx', 'app-agency'],
      ['apps/web/src/app/(onboarding)/agency/setup/page.tsx', 'app-agency'],
      ['apps/web/src/app/(platform)/platform/health/page.tsx', 'app-platform'],
      ['apps/web/src/app/sign-in/page.tsx', 'app-account'],
      ['apps/web/src/app/(app)/inbox/page.tsx', 'app-account'],
      ['apps/web/src/components/page-header.tsx', 'app-shared'],
      ['packages/ui/src/components/button.tsx', 'app-shared'],
      ['apps/web/src/app/(app)/c/[clientId]/briefs/copy.ts', 'app-client'],
      ['apps/web/src/lib/spend-copy.ts', 'app-shared'],
      ['apps/web/src/help/copy/client.ts', 'help'],
      ['apps/web/src/help/copy/index.ts', null],
      ['docs/help/pages/x.md', 'guides'],
      ['docs/help/reading-your-brief.md', 'guides'],
      ['packages/core/src/help/glossary.ts', 'glossary'],
      ['apps/web/src/lib/labels.ts', 'labels'],
      ['packages/tools/src/workspace/labels.ts', 'labels'],
      ['apps/site/content/home.ts', 'site'],
      ['apps/site/content/sample-brief.json', 'site'],
      ['apps/site/src/components/join/copy.ts', 'site'],
      ['apps/site/src/app/page.tsx', 'site'],
      ['apps/site/content/legal/privacy.md', 'site-legal'],
      ['packages/tools/src/a/b.ts', 'mcp-tools'],
      ['packages/email/src/templates/alert.tsx', null],
      ['apps/web/src/components/onboarding/previews/brief-cover.tsx', null],
      ['apps/web/src/app/(app)/c/[clientId]/brief/page.test.tsx', null],
      ['apps/web/e2e-shots/shots.ts', null],
      ['apps/web/src/dev-panel/banner.tsx', null],
      ['apps/web/src/app/dev-panel/[...path]/route.ts', null],
      ['apps/web/src/server/tools.ts', 'app-shared'],
      ['packages/ask/src/prompt.ts', null],
      // Ruling R8 / I4: copy built outside apps/.
      ['packages/engine/src/briefs/self-rules.ts', 'app-client'],
      ['packages/engine/src/briefs/starting-point.ts', 'app-client'],
      ['packages/engine/src/briefs/scorecard-model.ts', 'app-client'],
      ['packages/ask/src/quota.ts', 'app-client'],
      ['packages/engine/src/briefs/readiness.ts', 'app-agency'],
      ['packages/engine/src/briefs/recommendations.ts', 'app-agency'],
      ['packages/engine/src/alerts/route.ts', 'app-agency'],
      ['packages/billing/src/access.ts', 'app-agency'],
      ['packages/tools/src/isolation/fixtures.ts', null],
    ];
    for (const [file, surface] of table) expect([file, surfaceFor(file)]).toEqual([file, surface]);
  });

  it('every inventory path from the brief matches a rule', () => {
    // docs/work/copy-signoff-tool.md § Brief → "Inventory of copy sources" (emails/documents come from previews, Task 5).
    const inventory = [
      'apps/web/src/help/copy/account.ts', 'apps/web/src/help/copy/agency.ts', 'apps/web/src/help/copy/client.ts',
      'apps/web/src/help/copy/platform.ts', 'packages/core/src/help/glossary.ts',
      'docs/help/pages/client.home.client.md', 'docs/help/asking-the-assistant.md',
      'apps/web/src/lib/labels.ts', 'packages/email/src/labels.ts', 'packages/ask/src/labels.ts',
      'packages/tools/src/workspace/labels.ts', 'packages/engine/src/model-ops/labels.ts',
      'apps/web/src/app/(app)/c/[clientId]/briefs/copy.ts', 'apps/web/src/app/(app)/c/[clientId]/rankings/scan-copy.ts',
      'apps/web/src/app/(onboarding)/c/[clientId]/setup/refusal-copy.ts', 'apps/web/src/app/sign-up/problem/copy.ts',
      'apps/web/src/components/client/owner-welcome-copy.ts', 'apps/web/src/lib/spend-copy.ts',
      'apps/web/src/lib/platform-spend-copy.ts',
      'apps/web/src/app/(app)/c/[clientId]/page.tsx', 'apps/site/src/app/page.tsx', 'packages/ui/src/components/button.tsx',
      'packages/tools/src/inbox.ts', 'packages/engine/src/briefs/notify.ts',
      'apps/site/content/home.ts', 'apps/site/content/legal/privacy.md', 'apps/site/content/legal/terms.md',
      'apps/site/content/sample-brief.json', 'apps/site/content/verticals.json', 'apps/site/src/components/join/copy.ts',
    ];
    for (const file of inventory) expect([file, surfaceFor(file)]).not.toEqual([file, null]);
  });

  it('every rule uses a scan mode with its required options', () => {
    for (const r of SOURCES) {
      expect(r.include.length).toBeGreaterThan(0);
      if (r.mode === 'property') expect(r.properties?.length).toBeGreaterThan(0);
    }
  });
});

describe('collectScanned', () => {
  it('collectScanned on the real repo returns > 1500 items and none from excluded paths', () => {
    const items = collectScanned(ROOT);
    expect(items.length).toBeGreaterThan(1500);
    const bad = items.filter((i) =>
      /\.test\.|(^|\/)e2e[^/]*\/|\.d\.ts$|^packages\/email\/src\/templates\/|^apps\/web\/src\/components\/onboarding\/previews\/|dev-panel/.test(i.file));
    expect(bad).toEqual([]);
    for (const s of ['app-client', 'app-agency', 'app-platform', 'app-account', 'app-shared', 'help', 'guides', 'glossary', 'labels', 'site', 'site-legal', 'mcp-tools']) {
      expect([s, items.some((i) => i.surface === s)]).toEqual([s, true]);
    }
    expect(items.every((i) => !i.file.includes('\\') && !i.file.startsWith('/'))).toBe(true);
    const keys = items.map((i) => `${i.surface}\u0000${i.file}\u0000${String(i.line).padStart(6, '0')}`);
    expect(keys).toEqual([...keys].sort());
    // Final-review misses (Ruling R8): each must now be scanned.
    const has = (file: string, text: string) => items.some((i) => i.file === file && i.text === text);
    expect(has('apps/site/content/pricing-page.ts', 'For local businesses')).toBe(true);
    expect(has('packages/engine/src/briefs/self-rules.ts', 'Your rating is {ys}; the rival median is {ms}.')).toBe(true);
    expect(has('packages/ask/src/quota.ts', 'Ask is paused for the rest of this month. Your past answers are still here.')).toBe(true);
    expect(has('packages/tools/src/access/team.ts', "You've sent a lot of invites today. Try again tomorrow.")).toBe(true);
  }, 60_000);
});

describe('error text (Ruling R3)', () => {
  const scanAs = (file: string, src: string) => {
    const rule = ruleFor(file)!;
    return { rule, items: scanTsFile(file, src, rule) };
  };

  it('server action error values are scanned with route surface', () => {
    const src = `'use server';
      export async function save(fd: FormData) {
        if (!fd.get('x')) return { ok: false, error: 'Enter a name first.' };
        logger.warn({ error: 'Logged only' }, 'x');
        if (fd.get('y')) return fail('Pick a channel first.');
        return { ok: true, message: 'Saved.', status: 'done', label: 'Delivery settings' };
      }`;
    const client = scanAs('apps/web/src/app/(app)/c/[clientId]/settings/delivery/actions.ts', src);
    // Ruling R8 / I3: server modules are scanned in module mode (labels and result-helper messages too).
    expect(client.rule).toMatchObject({ surface: 'app-client', mode: 'module' });
    expect(client.items.map((i) => i.text)).toEqual(['Enter a name first.', 'Pick a channel first.', 'Saved.', 'Delivery settings']);
    expect(surfaceFor('apps/web/src/app/(app)/agency/leads/actions.ts')).toBe('app-agency');
    expect(surfaceFor('apps/web/src/app/(platform)/platform/billing/actions.ts')).toBe('app-platform');
    expect(surfaceFor('apps/web/src/app/sign-up/actions.ts')).toBe('app-account');
    expect(surfaceFor('apps/web/src/server/forms.ts')).toBe('app-shared');
    // Copy modules keep module mode; webhooks and Sentry config are not user-facing.
    expect(ruleFor('apps/web/src/lib/spend-copy.ts')?.mode).toBe('module');
    for (const f of ['apps/web/src/app/api/stripe/webhook/route.ts', 'apps/web/src/lib/sentry-options.ts', 'apps/web/src/proxy.ts']) {
      expect([f, surfaceFor(f)]).toEqual([f, null]);
    }
  });

  it('ToolError message is scanned in mcp-tools', () => {
    const src = `export const LAST_ADMIN_MESSAGE = 'An agency needs at least one admin.';
      const KIND = 'invite_rate';
      const RATE_LIMITED = "You've sent a lot of invites today. Try again tomorrow.";
      const refuse = (msg: string) => new ToolError('invalid_input', msg, { userFacing: true });
      export const tool = { name: 'x', description: 'Does the thing.', run: async () => {
        if (a) throw new ToolError('not_found', 'Client not found');
        if (b) throw refuse('That play is already adopted.');
        if (c) throw new Error('Internal Only Thing');
        if (d) throw new ToolError('internal', 'Evidence storage is not configured');
        if (e) throw new ToolError('internal', 'Search is down right now.', { userFacing: true });
        throw new ToolError('invalid_input', \`Too many items: \${n}\`);
      } };`;
    const { rule, items } = scanAs('packages/tools/src/tools/x.ts', src);
    expect(rule.surface).toBe('mcp-tools');
    expect(items.map((i) => i.text)).toEqual([
      'An agency needs at least one admin.', "You've sent a lot of invites today. Try again tomorrow.", 'Does the thing.', 'Client not found', 'That play is already adopted.', 'Search is down right now.',
      'Too many items: {n}',
    ]);
  });
});
