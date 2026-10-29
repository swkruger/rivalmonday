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

/** Not user-facing although under a scanned web dir: payment/email webhooks (server-to-server) and Sentry config. */
const WEB_NOT_USER_FACING = ['apps/web/src/app/api/stripe/**', 'apps/web/src/app/api/postmark/**', 'apps/web/src/lib/sentry-*.ts'];

/**
 * Web sources split by route group: `.tsx` in jsx mode; every `.ts` (copy modules, server actions, server modules) in
 * module mode (spec 3.1; Ruling R8 / I3 widened R3's `error` / `message` property mode to the module catch-all, so
 * labels in view models, result-helper messages and validation lists are scanned too).
 */
function webRules(surface: Surface, dirs: string[], exclude: string[] = []): SourceRule[] {
  return [
    { surface, mode: 'jsx', include: dirs.map((d) => `${d}/**/*.tsx`), exclude },
    { surface, mode: 'module', include: dirs.map((d) => `${d}/**/*.ts`), exclude: [...exclude, ...WEB_NOT_USER_FACING] },
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
  // Ruling R8 / I4: copy built outside apps/. Client-facing brief text (starting-point findings and why-it-matters,
  // the "Where you stand" scorecard, the quiet-week summary) and Ask's client messages. Model prompts in these files
  // show up too: Ignore them (prompts are a spec non-goal).
  {
    surface: 'app-client',
    mode: 'module',
    include: [
      'packages/engine/src/briefs/self-rules.ts', 'packages/engine/src/briefs/starting-point.ts',
      'packages/engine/src/briefs/scorecard-model.ts', 'packages/engine/src/briefs/generate.ts', 'packages/ask/src/quota.ts',
    ],
  },
  // Agency-facing engine / billing text: alert routing notes, brief delivery notices, review refusals, billing
  // access messages and the billing pill.
  {
    surface: 'app-agency',
    mode: 'module',
    include: [
      'packages/engine/src/alerts/route.ts', 'packages/engine/src/briefs/deliver.ts', 'packages/engine/src/briefs/readiness.ts',
      'packages/engine/src/briefs/recommendations.ts', 'packages/billing/src/access.ts', 'packages/billing/src/pill.ts',
    ],
  },
  // Account, auth and public pages: everything else under app/ except the dev panel (never ships).
  ...webRules('app-account', [`${WEB}/app`], [`${WEB}/app/dev-panel/**`]),
  ...webRules('app-shared', [`${WEB}/components`, `${WEB}/lib`, `${WEB}/server`]),
  { surface: 'app-shared', mode: 'jsx', include: ['packages/ui/src/**/*.tsx'] },
  { surface: 'site-legal', mode: 'markdown', include: ['apps/site/content/legal/*.md'] },
  { surface: 'site', mode: 'module', include: ['apps/site/content/*.ts', 'apps/site/content/*.json', 'apps/site/src/**/copy.ts'] },
  { surface: 'site', mode: 'jsx', include: ['apps/site/src/**/*.tsx'] },
  // Tool descriptions (D11), refusal text (R3: `ToolError` / `refuse` / `refused` are built-in message calls) and every
  // other user-facing tool string (R8 / I3): module mode, so message constants, validation lists, returned reasons and
  // zod messages are scanned. Isolation fixtures are test data.
  {
    surface: 'mcp-tools',
    mode: 'module',
    include: ['packages/tools/src/**/*.ts'],
    exclude: ['packages/tools/src/isolation/**'],
  },
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
