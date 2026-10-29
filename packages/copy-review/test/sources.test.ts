import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectScanned } from '../src/collect.js';
import { SOURCES, surfaceFor } from '../src/sources.js';

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
      ['apps/web/src/server/tools.ts', null],
      ['packages/ask/src/prompt.ts', null],
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
  }, 60_000);
});
