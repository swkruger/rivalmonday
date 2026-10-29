import { posix } from 'node:path';
import type { SourceRule, Surface } from './types.js';

/** Excluded from every rule: tests, E2E/shots harnesses, declarations, rendered-as-preview emails and their mocks. */
export const ALWAYS_EXCLUDE: readonly string[] = [
  '**/*.test.*',
  '**/e2e*/**',
  '**/*.d.ts',
  'packages/email/src/templates/**',
  'apps/web/src/components/onboarding/previews/**',
];

const WEB = 'apps/web/src';

/** Web sources split by route group: `.tsx` in jsx mode, `*copy*.ts` modules in module mode (spec 3.1). */
function webRules(surface: Surface, dirs: string[], exclude?: string[]): SourceRule[] {
  return [
    { surface, mode: 'module', include: dirs.map((d) => `${d}/**/*copy*.ts`), exclude },
    { surface, mode: 'jsx', include: dirs.map((d) => `${d}/**/*.tsx`), exclude },
  ];
}

/**
 * Spec 3.1 source table, refined against the tree. Order matters: the first rule whose `include` matches a file (and
 * whose `exclude` does not) decides its surface and mode.
 */
export const SOURCES: readonly SourceRule[] = [
  { surface: 'help', mode: 'module', include: [`${WEB}/help/copy/*.ts`], exclude: [`${WEB}/help/copy/index.ts`, `${WEB}/help/copy/payload.ts`] },
  { surface: 'guides', mode: 'markdown', include: ['docs/help/pages/**/*.md', 'docs/help/*.md'] },
  { surface: 'glossary', mode: 'module', include: ['packages/core/src/help/glossary.ts'] },
  {
    surface: 'labels',
    mode: 'module',
    include: [`${WEB}/lib/labels.ts`, 'packages/email/src/labels.ts', 'packages/ask/src/labels.ts', 'packages/tools/src/workspace/labels.ts', 'packages/engine/src/model-ops/labels.ts'],
  },
  ...webRules('app-client', [`${WEB}/app/(app)/c`, `${WEB}/app/(onboarding)/c`]),
  ...webRules('app-agency', [`${WEB}/app/(app)/agency`, `${WEB}/app/(onboarding)/agency`]),
  ...webRules('app-platform', [`${WEB}/app/(platform)`]),
  // Agency-facing notification titles/lines (inbox + agency notice email), built in the engine.
  { surface: 'app-agency', mode: 'module', include: ['packages/engine/src/briefs/notify.ts'] },
  // Account, auth and public pages: everything else under app/ except the dev panel (never ships).
  ...webRules('app-account', [`${WEB}/app`], [`${WEB}/app/dev-panel/**`]),
  ...webRules('app-shared', [`${WEB}/components`, `${WEB}/lib`]),
  { surface: 'app-shared', mode: 'jsx', include: ['packages/ui/src/**/*.tsx'] },
  { surface: 'site-legal', mode: 'markdown', include: ['apps/site/content/legal/*.md'] },
  { surface: 'site', mode: 'module', include: ['apps/site/content/*.ts', 'apps/site/content/*.json', 'apps/site/src/**/copy.ts'] },
  { surface: 'site', mode: 'jsx', include: ['apps/site/src/**/*.tsx'] },
  { surface: 'mcp-tools', mode: 'property', include: ['packages/tools/src/**/*.ts'], properties: ['description'] },
];

const matches = (file: string, globs: readonly string[] | undefined) => !!globs?.some((g) => posix.matchesGlob(file, g));

/** The rule that owns a repo-relative file (forward slashes), or null when no rule covers it or it is excluded. */
export function ruleFor(file: string): SourceRule | null {
  if (matches(file, ALWAYS_EXCLUDE)) return null;
  return SOURCES.find((r) => matches(file, r.include) && !matches(file, r.exclude)) ?? null;
}

export function surfaceFor(file: string): Surface | null {
  return ruleFor(file)?.surface ?? null;
}
