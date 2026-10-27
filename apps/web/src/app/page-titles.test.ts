import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { navFor, type NavRoleFlags, settingsNavFor } from '@/components/shell/nav-items';

/**
 * 15a §2.7: every agency, platform, client, settings and account page renders one `PageHeader` whose `title` equals its menu
 * label, and exports the same `metadata.title` (the tab reads `{title} · {agency}`, or `· Rival Monday` on platform).
 * Source checks, like the settings layout test: the pages' server-only reads make importing them here impractical.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const metadataTitle = (label: string) => new RegExp(`export const metadata(?:: Metadata)? = \\{ title: '${esc(label)}' \\}`);
const headerTitle = (label: string) => new RegExp(`<PageHeader[^>]*\\btitle="${esc(label)}"`);

const flags: NavRoleFlags = {
  isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency', dashboard: true, alertRules: true, mcp: true,
  isPlatformOperator: true, isPlatformOwner: true, leads: true,
};

/** Menu pages: `(group)/<href>/page.tsx` → its nav label. The settings entries link to a settings tab (titled as the tab). */
const menuPages: [file: string, label: string][] = [
  ...navFor('agency', flags, null).flatMap((s) => s.items).filter((i) => !i.match).map((i) => [`(app)${i.href}/page.tsx`, i.label] as [string, string]),
  ...settingsNavFor('agency', flags).flatMap((s) => s.items).map((i) => [`(app)${i.href}/page.tsx`, i.label] as [string, string]),
  ...navFor('platform', flags, null).flatMap((s) => s.items).map((i) => [`(platform)${i.href}/page.tsx`, i.label] as [string, string]),
];

/**
 * Client menu pages (`/c/x/<page>` → `(app)/c/[clientId]/<page>/page.tsx`). Ask's title carries the assistant's name
 * (checked below) and Client settings links to a settings tab (titled as the tab). Settings tabs come from both role views
 * (a client owner's Billing tab is client-only).
 */
const clientFile = (href: string) => `(app)/c/[clientId]${href.slice('/c/x'.length)}/page.tsx`;
const owner: NavRoleFlags = { ...flags, isAgency: false, isAgencyAdmin: false, homePath: '/c/x', clientBilling: true };
const clientMenuPages: [file: string, label: string][] = navFor('client', { ...flags, ask: true }, 'x')
  .flatMap((s) => s.items).filter((i) => !i.href.endsWith('/ask') && !i.match)
  .map((i) => [clientFile(i.href), i.label] as [string, string]);
const clientSettingsPages: [file: string, label: string][] = [
  ...new Map([...settingsNavFor('client', flags, 'x'), ...settingsNavFor('client', owner, 'x')].flatMap((s) => s.items).map((i) => [i.href, i.label])),
].map(([href, label]) => [clientFile(href), label] as [string, string]);

/** Pages outside the menus with a fixed title. */
const otherPages: [file: string, label: string][] = [
  ['(platform)/platform/knowledge/new/page.tsx', 'New article'],
  ['(platform)/platform/health/page.tsx', 'Health'],
  ['(app)/inbox/page.tsx', 'Inbox'],
  ['(app)/agency/help/page.tsx', 'Help'],
  ['(app)/c/[clientId]/help/page.tsx', 'Help'],
  ['(platform)/platform/help/page.tsx', 'Help'],
  ['(app)/settings/notifications/page.tsx', 'Notification settings'],
  ['(app)/c/[clientId]/pitch-snapshot/page.tsx', 'Pitch snapshot'],
];

/** Detail pages: the title comes from the record (`generateMetadata`, sharing the page's cached read). */
const detailPages = [
  '(app)/agency/approvals/[briefId]/page.tsx',
  '(app)/agency/prospects/[clientId]/page.tsx',
  '(platform)/platform/agencies/[id]/page.tsx',
  '(platform)/platform/knowledge/[id]/page.tsx',
  '(platform)/platform/ask/[threadId]/page.tsx',
  '(app)/kb/[id]/page.tsx',
  '(app)/c/[clientId]/briefs/[briefId]/page.tsx',
  '(app)/c/[clientId]/alerts/[alertId]/page.tsx',
  '(app)/c/[clientId]/reports/[reportId]/page.tsx',
  '(app)/c/[clientId]/evidence/[evidenceId]/page.tsx',
  '(app)/c/[clientId]/competitors/[competitorId]/page.tsx',
];

/** Every `.tsx` (pages, layouts, components, tests) under a route tree. */
function tsxUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(here, dir))) {
      const path = `${dir}/${name}`;
      if (statSync(join(here, path)).isDirectory()) walk(path);
      else if (name.endsWith('.tsx')) out.push(path);
    }
  };
  walk(rel);
  return out;
}

describe('page titles = menu labels (15a §2.7)', () => {
  it('covers the Approvals rename and the platform labels', () => {
    expect(menuPages).toContainEqual(['(app)/agency/approvals/page.tsx', 'Approvals']);
    expect(menuPages).toContainEqual(['(platform)/platform/ask/page.tsx', 'Ask reviews']);
    expect(menuPages).toContainEqual(['(platform)/platform/costs/page.tsx', 'Costs']);
    expect(menuPages).toContainEqual(['(app)/agency/settings/team/page.tsx', 'Team']);
  });

  it('covers the client menu and its settings tabs', () => {
    expect(clientMenuPages).toContainEqual(['(app)/c/[clientId]/page.tsx', 'Overview']);
    expect(clientMenuPages).toContainEqual(['(app)/c/[clientId]/briefs/page.tsx', 'Briefs & reports']);
    expect(clientMenuPages).toContainEqual(['(app)/c/[clientId]/rankings/page.tsx', 'Local rankings']);
    expect(clientMenuPages).toHaveLength(10);
    expect(clientSettingsPages.map(([, l]) => l)).toEqual(['Business profile', 'Delivery', 'Alert rules', 'Runbook', 'AI connection', 'Usage', 'Billing']);
  });

  it.each([...menuPages, ...otherPages, ...clientMenuPages, ...clientSettingsPages])('%s: PageHeader title and metadata.title are "%s"', (file, label) => {
    const source = read(file);
    expect(source).toMatch(headerTitle(label));
    expect(source).toMatch(metadataTitle(label));
  });

  it.each(detailPages)('%s: a PageHeader with a breadcrumb and generateMetadata', (file) => {
    const source = read(file);
    expect(source).toMatch(/<PageHeader[^>]*\bbreadcrumb=/);
    expect(source).toContain('export async function generateMetadata');
  });

  it.each([...clientMenuPages.filter(([, l]) => l !== 'Overview'), ...clientSettingsPages])('%s: a client breadcrumb', (file) => {
    expect(read(file)).toMatch(/<PageHeader[^>]*\bbreadcrumb=\{client(Settings)?Crumbs\(/);
  });

  it('settings tabs use the "Client settings" breadcrumb; the Overview has none (also on the briefs-only home)', () => {
    // "Client settings" links to the index only when it serves the viewer (not for guests).
    for (const [file] of clientSettingsPages) {
      expect(read(file), file).toContain('clientSettingsCrumbs(');
      expect(read(file), file).toContain('hasClientSettings(clientId)');
    }
    expect(read('(app)/c/[clientId]/page.tsx')).not.toMatch(/\bbreadcrumb=/);
    expect(read('../components/client-home-basic.tsx')).toMatch(/<PageHeader[^>]*\btitle="Overview"/);
    expect(read('../components/client-home-basic.tsx')).not.toMatch(/\bbreadcrumb=/);
  });

  it('Ask is titled "Ask {assistant}" (a dynamic tab title) with a client breadcrumb', () => {
    expect(read('(app)/c/[clientId]/ask/ask-screen.tsx')).toMatch(/<PageHeader[^>]*\btitle=\{askTitle\}[^>]*\bbreadcrumb=/);
    expect(read('(app)/c/[clientId]/ask/ask-screen.tsx')).toContain('const askTitle = `Ask ${assistantName}`');
    for (const f of ['(app)/c/[clientId]/ask/page.tsx', '(app)/c/[clientId]/ask/[threadId]/page.tsx']) expect(read(f), f).toContain('export async function generateMetadata');
  });

  it('client detail pages drop the "— {client}" title suffix', () => {
    for (const f of ['(app)/c/[clientId]/competitors/page.tsx', '(app)/c/[clientId]/recommendations/page.tsx', '(app)/c/[clientId]/pitch-snapshot/page.tsx']) {
      expect(read(f), f).not.toMatch(/— \{profile\.name\}/);
    }
  });

  it('the client setup wizard shows its own step; its tab title matches the page ("Set up {client}")', () => {
    // 16: the setup is a full-page OnboardingShell; each of its screens sets `step={stepOf(frame, <screen>)}` (the screen's place in the viewer's list).
    for (const f of ['area-step', 'competitors-step', 'invite-step', 'billing-step', 'done-step']) expect(read(`(onboarding)/c/[clientId]/setup/steps/${f}.tsx`), f).toMatch(/<OnboardingShell[^>]*step=\{stepOf\(frame, '/);
    const source = read('(onboarding)/c/[clientId]/setup/page.tsx');
    expect(source).toContain('export async function generateMetadata');
    expect(source).toContain('const titleOf = (profile: ClientProfile) => `Set up ${profile.name}`');
    expect(source).not.toMatch(/export const metadata/);
  });

  it('onboarding shows its step; Add a client / Add a prospect are steps 1 and 2 of the client flow', () => {
    // 16: the wizard is a full-page OnboardingShell; each step screen sets its own `step={{ n, of, label }}`.
    for (const step of ['about', 'team', 'brand', 'done']) expect(read(`(onboarding)/onboarding/steps/${step}.tsx`)).toMatch(/<OnboardingShell[^>]*step=\{\{/);
    expect(read('(onboarding)/agency/clients/new/details-step.tsx')).toMatch(/<OnboardingShell[^>]*step=\{\{ n: 1,/);
    expect(read('(onboarding)/agency/clients/new/find-step.tsx')).toMatch(/<OnboardingShell[^>]*step=\{\{ n: 2,/);
    expect(read('(onboarding)/agency/clients/new/details-step.tsx')).toContain("title={kind === 'prospect' ? 'Add a prospect' : 'Add a client'}");
    expect(read('(onboarding)/agency/clients/new/page.tsx')).toMatch(metadataTitle('Add a client'));
    expect(read('(onboarding)/agency/prospects/new/page.tsx')).toMatch(metadataTitle('Add a prospect'));
  });

  it('no file under the touched trees renders its own h1 (PageHeader owns it)', () => {
    const files = [
      ...['(app)/agency', '(platform)/platform', '(app)/inbox', '(app)/settings', '(app)/kb', '(onboarding)', '(app)/c', '../components/views'].flatMap(tsxUnder),
      '../components/client-home-basic.tsx',
    ];
    expect(files.length).toBeGreaterThan(200);
    for (const file of files) expect(read(file), file).not.toMatch(/<h1\b/);
  });
});

describe('title templates (15a §2.7)', () => {
  it('the root layout names no product: default "Dashboard", bare template', () => {
    const source = read('layout.tsx');
    expect(source).toContain("title: { default: 'Dashboard', template: '%s' }");
    expect(source).not.toContain('Rival Monday');
  });
});
