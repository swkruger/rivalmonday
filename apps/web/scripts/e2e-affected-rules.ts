/**
 * Which Playwright E2E tests a set of changed files can affect (pure, no I/O). Used by `scripts/e2e-affected.ts`.
 *
 * Rules are matched in order against repo-relative POSIX paths; the first match wins. `tags` lists the module tags
 * whose tests to run (`[]` = no test covers it beyond the always-run `@smoke`), `'all'` runs the whole suite (the
 * fail-safe for anything shared) and `'none'` needs no E2E. When unsure, a rule says `'all'`.
 */
export type RuleTags = string[] | 'all' | 'none';
export type Rule = { pattern: RegExp; tags: RuleTags; why: string; fallback?: true };
export type Affected = { mode: 'none' | 'some' | 'all'; tags: string[]; reasons: string[] };

/** Every tag a spec test may carry. `@smoke` runs on every non-`none` decision. */
export const KNOWN_TAGS = [
  '@smoke', '@auth', '@guest', '@dev-panel', '@clients', '@briefs', '@recommendations', '@alerts', '@usage', '@runbook',
  '@profile', '@platform', '@prospects', '@changes', '@evidence', '@moves', '@competitors', '@overview', '@alert-rules',
  '@pricing', '@ads', '@reviews', '@rankings', '@nav', '@responsive', '@ai-connections', '@ask', '@kb', '@support', '@costs', '@rivals', '@starting-point', '@billing', '@client-billing', '@onboarding', '@setup', '@leads', '@navigation', '@catalogue',
] as const;

const WEB = 'apps/web/';
const APP = `${WEB}src/app/`;
const C = `${APP}\\(app\\)/c/\\[clientId\\]/`;
const AGENCY = `${APP}\\(app\\)/agency/`;
const COMP = `${WEB}src/components/`;
const SERVER = `${WEB}src/server/`;
const re = (s: string) => new RegExp(`^${s}`);

const GUEST_FILES = ['@guest', '@evidence', '@briefs'];
/** Every tag whose tests open an agency settings page (`/agency/settings/*`). */
const SETTINGS_PAGES = ['@usage', '@runbook', '@support', '@billing', '@client-billing', '@leads', '@ai-connections', '@navigation'];
/** Every tag whose tests open a client settings page (`/c/<id>/settings/*`). */
const CLIENT_SETTINGS_PAGES = ['@profile', '@clients', '@ask', '@support', '@billing', '@client-billing', '@setup', '@alert-rules', '@ai-connections', '@navigation', '@runbook'];

/** Keyword rules for the domain packages; anything there no keyword catches runs everything. */
const PKG = 'packages/(?:tools|engine|email|storage|collectors|ai)/src/|packages/(?:verticals|demo)/';
const kw = (words: string, tags: string[], why: string): Rule => ({
  pattern: new RegExp(`^(?:${PKG})(?:.*/)?[^/]*(?:${words})`),
  tags,
  why: `package keyword: ${why}`,
});

export const RULES: Rule[] = [
  // --- No E2E needed ---
  { pattern: /\.md$/, tags: 'none', why: 'documentation' },
  { pattern: /^docs\//, tags: 'none', why: 'documentation' },
  { pattern: /^\.claude\//, tags: 'none', why: 'agent tooling' },
  { pattern: /\.test\.tsx?$/, tags: 'none', why: 'unit test' },
  { pattern: /^apps\/worker\//, tags: 'none', why: 'the web app does not depend on the worker' },
  { pattern: /^apps\/web\/(?:e2e-panel\/|playwright\.panel\.config\.ts$)/, tags: 'none', why: 'dev-panel E2E (separate config)' },
  { pattern: re(`${WEB}scripts/(?:check-)?no-dev-panel\\.ts$`), tags: ['@dev-panel'], why: 'production-build dev-panel check' },
  { pattern: re(`${WEB}scripts/`), tags: 'none', why: 'web CLI scripts are not part of the build' },
  { pattern: re(`${WEB}(?:test/|vitest\\.config\\.ts$)`), tags: 'none', why: 'unit-test setup' },
  { pattern: /^packages\/[^/]+\/(?:test\/|vitest\.config\.ts$)/, tags: 'none', why: 'unit-test setup' },

  // --- Spec files: their own tests (resolved from the spec's tags) ---
  { pattern: re(`${WEB}e2e/[^/]+\\.spec\\.ts$`), tags: [], why: 'changed spec file' },

  // --- Foundations: everything ---
  { pattern: re(`${WEB}e2e/`), tags: 'all', why: 'E2E seed/helpers/setup' },
  { pattern: re(`${WEB}(?:playwright\\.config\\.ts|package\\.json|next\\.config\\.[^/]+|tsconfig\\.json|postcss\\.config\\.[^/]+)$`), tags: 'all', why: 'web build/test config' },
  { pattern: re(`${APP}api/stripe/`), tags: [], why: 'Stripe webhook route (covered by its route test, no browser flow)' },
  { pattern: re(`${WEB}src/proxy\\.ts$`), tags: 'all', why: 'request proxy runs on every page' },
  { pattern: re(`${APP}(?:layout\\.tsx|globals\\.css|health/)`), tags: 'all', why: 'root layout/styles/health check' },
  { pattern: re(`${APP}\\((?:app|platform)\\)/(?:layout\\.tsx|actions\\.ts)$`), tags: 'all', why: 'signed-in app shell (agency/client and platform groups)' },
  { pattern: re(`${COMP}shell/`), tags: 'all', why: 'app shell (sidebar, top bar, nav)' },
  {
    pattern: re(`${SERVER}(?:auth|auth-options|env|db|run-tool|tools|viewer|current-viewer|theme|branding|nav|safe-next|runtime-env|billing-redirect|billing-state)\\.ts$`),
    tags: 'all',
    why: 'shared server foundation',
  },
  { pattern: /^packages\/tools\/src\/(?:setup\/|tools\/setup\.ts$)/, tags: ['@setup', '@clients'], why: 'client setup wizard tools (state, lookup, suggestions, profile change)' },
  { pattern: /^packages\/tools\/src\/(?:tools|platform)\/support\.ts$/, tags: ['@support', '@platform'], why: 'support-session tools and service (start/end, history, console list)' },
  { pattern: /^packages\/tools\/src\/(?:platform\/costs\/|tools\/platform-costs\.ts$)/, tags: ['@costs'], why: 'platform costs tools, maths and snapshot service' },
  { pattern: /^packages\/tools\/src\/(?:platform\/|tools\/platform-console\.ts$)/, tags: ['@platform'], why: 'platform console tools and nightly stats' },
  { pattern: /^packages\/(?:ui|core|db)\//, tags: 'all', why: 'shared package (ui/core/db, incl. migrations and schema)' },
  { pattern: /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|tsconfig\.base\.json)$/, tags: 'all', why: 'workspace config' },

  // --- Web routes ---
  // --- AI connections (MCP server, OAuth consent, AI settings pages) ---
  { pattern: /^packages\/mcp\//, tags: ['@ai-connections'], why: 'AI connections (MCP server)' },
  { pattern: re(`${APP}(?:mcp/|\\.well-known/|oauth/)`), tags: ['@ai-connections'], why: 'AI connections (MCP route, OAuth metadata/consent)' },
  { pattern: re(`${APP}\\(app\\)/(?:agency/settings|c/\\[clientId\\]/settings|settings)/ai/`), tags: ['@ai-connections'], why: 'AI connections settings' },
  { pattern: re(`${SERVER}(?:mcp|oauth-consent|ai-connections)\\.ts$`), tags: ['@ai-connections'], why: 'AI connections server module' },
  { pattern: re(`${COMP}ai-connections\\.tsx$`), tags: ['@ai-connections'], why: 'AI connections cards' },

  // --- Ask assistant (6b) ---
  { pattern: /^packages\/ask\//, tags: ['@ask'], why: 'Ask package (turn, grounding, quota, starters)' },
  { pattern: re(`${APP}\\(platform\\)/platform/ask/`), tags: ['@ask', '@platform'], why: 'platform Ask review' },
  { pattern: re(`${APP}\\(platform\\)/platform/knowledge/`), tags: ['@kb', '@platform'], why: 'operator knowledge base UI' },
  { pattern: re(`${APP}\\(app\\)/kb/|${COMP}kb/`), tags: ['@ask', '@kb'], why: 'knowledge article page and sheet (opened from Ask citations)' },
  { pattern: re(`${SERVER}ask\\.ts$`), tags: ['@ask', '@kb'], why: 'Ask server wiring incl. the E2E fake AI (knowledge lookup)' },
  { pattern: re(`${WEB}src/(?:.*/)?ask(?:/|\\.ts$)`), tags: ['@ask'], why: 'Ask route, pages, components and server wiring' },

  { pattern: re(`${APP}(?:sign-up/|join/|onboarding/start/)`), tags: ['@auth', '@onboarding'], why: 'agency sign-up, invite-link redemption and the sign-up callback' },
  { pattern: re(`${APP}(?:sign-in/|api/auth/|link-[^/]+/|no-access/|page\\.tsx$)`), tags: ['@auth'], why: 'sign-in and link-error pages' },
  { pattern: re(`${APP}\\(platform\\)/platform/leads/`), tags: ['@leads', '@platform'], why: 'platform lead pool and assign form' },
  { pattern: /^packages\/tools\/src\/(?:intake\/|tools\/(?:platform-)?leads\.ts$)/, tags: ['@leads'], why: 'public intake functions, lead tools, preview and lead email' },
  { pattern: re(`${APP}start/`), tags: ['@leads'], why: 'public client intake pages (intake form, verify link, preview)' },
  { pattern: re(`(?:${APP}u/|${SERVER}unsubscribe\\.ts$)`), tags: [], why: 'setup-tip unsubscribe pages (public, no E2E yet)' },
  { pattern: re(`${APP}(?:l/|go/|files/)`), tags: GUEST_FILES, why: 'signed links and stored files' },
  { pattern: re(`${APP}dev-panel/`), tags: ['@dev-panel'], why: 'dev-panel route shell' },
  { pattern: re(`${AGENCY}page\\.tsx$`), tags: ['@clients', '@client-billing', '@onboarding'], why: 'agency client list (billing pill and actions, getting-started checklist)' },
  { pattern: re(`${AGENCY}alerts/`), tags: ['@alerts'], why: 'alert queue' },
  { pattern: re(`${AGENCY}approvals/`), tags: ['@briefs', '@recommendations', '@starting-point'], why: 'brief approvals (a starting point is approved and sent here)' },
  { pattern: re(`${AGENCY}clients/`), tags: ['@clients'], why: 'new client' },
  { pattern: re(`${AGENCY}settings/runbook/`), tags: ['@runbook'], why: 'agency runbook (Agency settings; old Playbooks paths redirect here)' },
  { pattern: re(`${C}settings/runbook/`), tags: ['@runbook'], why: 'client runbook page' },
  { pattern: re(`${APP}\\(platform\\)/platform/runbook/`), tags: ['@runbook', '@platform'], why: 'platform runbook page' },
  { pattern: re(`(?:${COMP}runbook/|${SERVER}runbook-[^/]+\\.ts$)`), tags: ['@runbook'], why: 'runbook editor components and server helpers' },
  { pattern: re(`${AGENCY}prospects/`), tags: ['@prospects', '@clients'], why: 'prospects' },
  { pattern: re(`${AGENCY}settings/usage/`), tags: ['@usage'], why: 'usage and limits' },
  { pattern: re(`${AGENCY}settings/branding/logo/`), tags: ['@onboarding'], why: 'logo upload route (the wizard branding step uploads a logo)' },
  { pattern: re(`${AGENCY}settings/team/`), tags: ['@support', '@navigation'], why: 'agency team page (a support session opens it; old /agency/team redirects here)' },
  { pattern: re(`${AGENCY}settings/branding/`), tags: ['@navigation'], why: 'agency branding page (old /agency/branding redirects here)' },
  { pattern: re(`${AGENCY}settings/slack-teams/`), tags: [], why: 'no E2E covers this agency page' },
  { pattern: re(`${AGENCY}settings/(?:layout|page)\\.tsx$`), tags: SETTINGS_PAGES, why: 'agency settings layout and index redirect (wrap every agency settings page)' },
  { pattern: re(`${C}settings/(?:layout|page)\\.tsx$|${SERVER}client-settings-nav\\.ts$`), tags: CLIENT_SETTINGS_PAGES, why: 'client settings layout, index redirect and tab list (wrap every client settings page)' },
  { pattern: re(`${COMP}settings-nav\\.tsx$`), tags: [...new Set([...SETTINGS_PAGES, ...CLIENT_SETTINGS_PAGES])], why: 'settings sub-nav (every agency and client settings page)' },
  { pattern: re(`${APP}\\(app\\)/onboarding/(?!start/)|${COMP}agency/`), tags: ['@onboarding'], why: 'onboarding wizard, checklist and shared branding editor' },
  { pattern: re(`${AGENCY}settings/platform-access/`), tags: ['@support'], why: 'agency support-session history and notify switch' },
  { pattern: re(`${C}settings/billing/`), tags: ['@billing', '@client-billing'], why: 'client owner billing page and portal action' },
  { pattern: re(`${AGENCY}leads/`), tags: ['@leads', '@prospects'], why: 'agency leads page, accept/decline actions' },
  { pattern: re(`${AGENCY}settings/intake/`), tags: ['@leads'], why: 'agency intake link settings page' },
  { pattern: re(`${AGENCY}settings/billing/`), tags: ['@billing', '@client-billing'], why: 'billing page, Client billing section, actions and seat CSV' },
  { pattern: re(`${APP}\\(app\\)/paused/`), tags: ['@billing'], why: 'suspended-workspace page' },
  { pattern: re(`${COMP}billing/`), tags: ['@billing', '@client-billing'], why: 'billing display formatting and client billing pill/actions shown on the billing pages' },
  { pattern: re(`${COMP}new-business-type(?:-model)?\\.tsx?$`), tags: ['@clients', '@leads', '@catalogue'], why: 'New business type panel (agency lookup step, lead accept)' },
  { pattern: re(`${COMP}place-summary\\.tsx$`), tags: ['@clients', '@leads'], why: 'lookup result card (agency lookup step, public intake form)' },
  { pattern: re(`${COMP}form-error\\.tsx$`), tags: 'all', why: 'ErrorNote/FormError: the one error primitive, rendered by form and action errors on almost every surface (incl. the seat-cap Upgrade link)' },
  { pattern: re(`${COMP}page-header\\.tsx$`), tags: 'all', why: 'PageHeader: the h1, breadcrumb and actions of almost every signed-in page (15a §2.7)' },
  { pattern: re(`${COMP}help/help-context\\.tsx$`), tags: 'all', why: 'HelpProvider: mounted by the app shell on every signed-in page (15b)' },
  { pattern: re(`${COMP}help/`), tags: [], why: 'HelpTip/FieldHint/EmptyState: not rendered on any page yet; unit-tested (15b Task 5)' },
  { pattern: re(`${COMP}client-crumbs\\.ts$`),tags: 'all', why: 'client breadcrumbs: every /c/<id> page header (15a §2.7)' },
  { pattern: re(`${COMP}prev-next\\.tsx$`), tags: ['@briefs', '@alerts', '@starting-point', '@navigation'], why: 'Previous / Next on the brief, alert and report pages (15a §2.8)' },
  { pattern: re(`${C}(?:page\\.tsx|overview-kpis\\.ts)$`), tags: ['@overview', '@starting-point'], why: 'client overview (starting-point progress card)' },
  { pattern: re(`${C}ads/`), tags: ['@ads'], why: 'ads view' },
  { pattern: re(`${C}alerts/`), tags: ['@alerts'], why: 'alert page' },
  { pattern: re(`${C}briefs/`), tags: ['@briefs', '@guest', '@starting-point', '@navigation'], why: 'Briefs & reports list and brief page (tabs, paging, Previous / Next)' },
  { pattern: re(`${C}changes/`), tags: ['@changes', '@evidence'], why: 'changes feed and evidence viewer' },
  { pattern: re(`${C}competitors/`), tags: ['@competitors', '@rivals'], why: 'competitors and profiles' },
  { pattern: re(`${C}setup/`), tags: ['@setup'], why: 'client setup wizard' },
  { pattern: re(`${C}evidence/`), tags: ['@evidence', '@guest'], why: 'evidence page' },
  { pattern: re(`${C}moves/`), tags: ['@moves'], why: 'moves' },
  { pattern: re(`${C}pitch-snapshot/`), tags: ['@prospects', '@guest'], why: 'pitch snapshot' },
  { pattern: re(`${C}pricing/`), tags: ['@pricing'], why: 'pricing view' },
  { pattern: re(`${C}rankings/`), tags: ['@rankings'], why: 'local rankings view' },
  { pattern: re(`${C}recommendations/`), tags: ['@recommendations'], why: 'recommendation board' },
  { pattern: re(`${C}reports/`), tags: [], why: 'no E2E covers the trend report page' },
  { pattern: re(`${C}reviews/`), tags: ['@reviews'], why: 'reviews view' },
  { pattern: re(`${C}settings/alerts/`), tags: ['@alert-rules'], why: 'alert rules' },
  { pattern: re(`${C}settings/profile/`), tags: ['@profile', '@clients', '@client-billing'], why: 'client profile and features (billing pill and actions)' },
  { pattern: re(`${C}settings/delivery/`), tags: [], why: 'no E2E covers this settings page' },
  { pattern: re(`${APP}\\(platform\\)/platform/billing/`), tags: ['@billing'], why: 'platform billing console (codes, invite links)' },
  { pattern: re(`${APP}\\(platform\\)/platform/costs/`), tags: ['@costs'], why: 'platform costs page, dialogs and warning strip' },
  { pattern: re(`${APP}\\(platform\\)/platform/agencies/\\[id\\]/`), tags: ['@platform', '@support'], why: 'platform agency page: View as agency dialog and start action' },
  { pattern: re(`${APP}\\(platform\\)/platform/verticals/`), tags: ['@catalogue', '@platform'], why: 'platform business-type review queue' },
  { pattern: /^packages\/tools\/src\/(?:catalog\/|tools\/(?:platform-)?verticals\.ts$)/, tags: ['@catalogue', '@clients', '@leads', '@platform'], why: 'vertical catalogue tools (create, review, merge)' },
  { pattern: re(`${APP}\\(platform\\)/platform/`), tags: ['@platform', '@reviews'], why: 'platform console, review/theme queues' },
  { pattern: re(`${APP}support/`), tags: ['@support'], why: 'support session Exit and end routes' },
  { pattern: re(`${APP}\\(app\\)/(?:inbox|settings/notifications)/`), tags: [], why: 'no E2E covers this page' },

  // --- Web components and server modules (by who renders/uses them) ---
  { pattern: re(`${WEB}src/dev-panel/`), tags: ['@dev-panel'], why: 'dev panel' },
  { pattern: re(`${COMP}(?:auth-card|sign-out-button)\\.tsx$`), tags: ['@auth'], why: 'sign-in pages' },
  { pattern: re(`${COMP}read-only\\.tsx$`), tags: 'all', why: 'read-only provider and WriteGuard (wrap write controls everywhere)' },
  { pattern: re(`${COMP}support-sessions-table\\.tsx$`), tags: ['@support', '@platform'], why: 'support-session history table (platform agency page and Platform access)' },
  { pattern: re(`${COMP}(?:client-home-basic|client-lists|stat-card)\\.tsx$`), tags: ['@overview', '@reviews', '@starting-point'], why: 'client overview/reviews (stat tiles also render the scorecard)' },
  { pattern: re(`${COMP}starting-point-card\\.tsx$`), tags: ['@starting-point', '@overview'], why: 'client-home starting-point progress card' },
  { pattern: re(`${COMP}client-profile-form\\.tsx$`), tags: ['@clients', '@profile', '@prospects'], why: 'client/prospect forms' },
  { pattern: re(`${COMP}evidence-chips\\.tsx$`), tags: ['@briefs', '@recommendations', '@overview', '@alerts', '@guest'], why: 'evidence chips' },
  { pattern: re(`${COMP}evidence-image\\.tsx$`), tags: ['@changes', '@evidence'], why: 'evidence snapshots' },
  { pattern: re(`${COMP}setup-badge\\.tsx$`), tags: ['@setup', '@clients', '@overview'], why: 'Finish setup badge (client overview and portfolio)' },
  { pattern: re(`${COMP}pressure-badge\\.tsx$`), tags: ['@clients', '@competitors'], why: 'pressure badge' },
  { pattern: re(`${COMP}rival/`), tags: ['@competitors', '@rivals'], why: 'rival tier chips and signal pills' },
  { pattern: re(`${COMP}prospect-landscape\\.tsx$`), tags: ['@prospects'], why: 'prospect landscape' },
  { pattern: re(`${COMP}recommendation-board\\.tsx$`), tags: ['@recommendations', '@briefs'], why: 'recommendation board' },
  { pattern: re(`${COMP}services-area-summary\\.tsx$`), tags: ['@profile'], why: 'client profile' },
  { pattern: re(`${COMP}spend-badge\\.tsx$`), tags: ['@clients', '@usage'], why: 'spend badge' },
  { pattern: re(`${COMP}charts/geo-grid\\.tsx$`), tags: ['@rankings'], why: 'geo-grid chart' },
  { pattern: re(`${COMP}charts/rank-trend\\.tsx$`), tags: ['@rankings'], why: 'rank trend chart (rankings Trend tab)' },
  { pattern: re(`${COMP}charts/change-grid\\.tsx$`), tags: ['@rankings'], why: 'rank change grid (rankings Compare tab)' },
  { pattern: re(`${COMP}charts/map-zoom\\.tsx$`), tags: ['@rankings'], why: 'zoom/pan for map-backed rank grids' },
  { pattern: re(`${COMP}charts/theme-heatmap\\.tsx$`), tags: ['@reviews'], why: 'theme heatmap' },
  { pattern: re(`${COMP}charts/line-chart\\.tsx$`), tags: ['@overview', '@pricing', '@ads', '@reviews', '@rankings'], why: 'line chart' },
  { pattern: re(`${COMP}views/brief-view\\.tsx$`), tags: ['@briefs', '@guest', '@auth', '@starting-point'], why: 'brief view (guest link lands here; starting point and quiet-week scorecard)' },
  { pattern: re(`${COMP}views/scorecard\\.tsx$`), tags: ['@briefs', '@starting-point'], why: 'starting-point / quiet-week scorecard (rendered inside the brief view)' },
  { pattern: re(`${COMP}views/alert-view\\.tsx$`), tags: ['@alerts'], why: 'alert view' },
  { pattern: re(`${COMP}views/report-view\\.tsx$`), tags: [], why: 'no E2E covers the report view' },
  { pattern: re(`${SERVER}(?:guest|links|files|store)\\.ts$`), tags: GUEST_FILES, why: 'guest links and stored files' },
  { pattern: re(`${SERVER}logo\\.ts$`), tags: ['@onboarding'], why: 'logo pipeline (sharp normalisation; the wizard E2E uploads a logo)' },
  { pattern: re(`${SERVER}support-[^/]+\\.ts$`), tags: ['@support'], why: 'support session cookie, mask and email modules' },
  { pattern: re(`${SERVER}(?:email-transport|sign-out|signup-cookie|pending-signup|onboarding-start|turnstile)\\.ts$`), tags: ['@auth', '@onboarding'], why: 'sign-in email / sign-out / sign-up' },

  // --- Domain packages: keyword rules (more specific first) ---
  kw('alert-rules', ['@alert-rules'], 'alert rules'),
  kw('\\bask\\b', ['@ask'], 'Ask (threads, starters, write allowlist, demo threads)'),
  kw('api-tokens|oauth', ['@ai-connections'], 'AI connections (tokens, OAuth)'),
  kw('word-diff|events|evidence|diff|changes', ['@changes', '@evidence'], 'events/evidence/diff'),
  kw('pric', ['@pricing'], 'pricing'),
  kw('playbook|runbook', ['@runbook'], 'playbooks and runbooks'),
  kw('scorecard|starting-point|readiness|self-rules', ['@starting-point', '@briefs'], 'starting point and scorecard'),
  kw('brief|recommendation', ['@briefs', '@recommendations', '@starting-point'], 'briefs/recommendations (incl. the starting-point status tool)'),
  kw('\\bads\\b', ['@ads'], 'ads'),
  kw('ranking|geogrid|grid|rank\\b', ['@rankings'], 'rankings'),
  kw('review|reputation|themes|complaints', ['@reviews', '@platform'], 'reviews/themes'),
  kw('moves', ['@moves'], 'moves'),
  kw('overview', ['@overview'], 'overview'),
  kw('pressure', ['@overview', '@clients', '@competitors'], 'competitive pressure'),
  kw('alert-queue|alert|digest', ['@alerts'], 'alerts'),
  kw('usage|limits', ['@usage'], 'usage/limits'),
  kw('agency-onboarding|signup|free-mail', ['@onboarding', '@auth'], 'agency sign-up, wizard and checklist'),
  kw('prospect|onboarding', ['@prospects', '@clients'], 'prospects/onboarding'),
  kw('competitor', ['@competitors'], 'competitors'),
  kw('settings|preferences|client-input|clients', ['@profile', '@clients'], 'settings/client input'),
  kw('support-session|platform-support', ['@support', '@platform'], 'support sessions'),
  kw('platform-costs', ['@costs'], 'platform costs'),
  kw('platform|model-ops', ['@platform'], 'platform/model ops'),
  kw('email|magic|sign-in', ['@auth'], 'sign-in email'),
  { pattern: new RegExp(`^(?:${PKG})`), tags: 'all', why: 'package file no keyword matches', fallback: true },

  // --- Catch-alls ---
  { pattern: re(WEB), tags: 'all', why: 'web file without a specific rule', fallback: true },
  { pattern: /^packages\//, tags: 'all', why: 'package file without a specific rule', fallback: true },
  { pattern: /.*/, tags: 'none', why: 'outside the web app and its packages', fallback: true },
];

export function matchRule(file: string): Rule {
  return RULES.find((r) => r.pattern.test(file))!;
}

const SPEC = /^apps\/web\/e2e\/([^/]+\.spec\.ts)$/;

/** `specTags` maps a spec file name (e.g. `smoke.spec.ts`) to the union of its tests' tags. */
export function resolveAffected(files: string[], specTags: Record<string, string[]>): Affected {
  const tags = new Set<string>();
  const reasons: string[] = [];
  let all = false;
  for (const file of files) {
    const rule = matchRule(file);
    if (rule.tags === 'none') continue;
    if (rule.tags === 'all') {
      all = true;
      reasons.push(`${file} → all (${rule.why})`);
      continue;
    }
    const spec = SPEC.exec(file)?.[1];
    // A changed spec we can't read tags for (e.g. new, or deleted) runs everything.
    const own = spec ? specTags[spec] : rule.tags;
    if (!own) {
      all = true;
      reasons.push(`${file} → all (spec without known tags)`);
      continue;
    }
    for (const t of own) tags.add(t);
    reasons.push(`${file} → ${own.length ? own.join(' ') : '@smoke only'} (${rule.why})`);
  }
  if (!all && !reasons.length) return { mode: 'none', tags: [], reasons };
  tags.add('@smoke');
  return { mode: all ? 'all' : 'some', tags: [...tags].sort(), reasons };
}

/** Playwright `--grep` for a tag set: any tag, not followed by more tag characters (`@ads` ≠ `@ads-x`). */
export function grepFor(tags: string[]): string {
  return `(${tags.join('|')})(?![\\w-])`;
}

/** Tags per spec file, parsed from `test('…', { tag: [...] }, …)` calls. Returns `null` for a call without tags. */
export function parseSpecTests(source: string): { title: string; tags: string[] | null }[] {
  const out: { title: string; tags: string[] | null }[] = [];
  const call = /\btest(?:\.(?:only|fixme|skip|fail|slow))?\(\s*(['"`])((?:\\.|(?!\1).)*)\1\s*,\s*(\{\s*tag\s*:\s*\[([^\]]*)\]\s*\}\s*,)?/g;
  for (const m of source.matchAll(call)) {
    const tags = m[3] ? [...m[4]!.matchAll(/['"]([^'"]+)['"]/g)].map((t) => t[1]!) : null;
    out.push({ title: m[2]!, tags });
  }
  return out;
}

export function specTagsFrom(sources: Record<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [file, src] of Object.entries(sources)) {
    out[file] = [...new Set(parseSpecTests(src).flatMap((t) => t.tags ?? []))].sort();
  }
  return out;
}
