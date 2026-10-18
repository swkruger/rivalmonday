import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { navFor, type NavRoleFlags, settingsNavFor } from '@/components/shell/nav-items';

/**
 * 15a §2.7: every agency, platform, settings and account page renders one `PageHeader` whose `title` equals its menu
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

/** Menu pages: `(group)/<href>/page.tsx` → its nav label. `/agency/settings` itself only redirects to the first tab. */
const menuPages: [file: string, label: string][] = [
  ...navFor('agency', flags, null).flatMap((s) => s.items).filter((i) => i.href !== '/agency/settings').map((i) => [`(app)${i.href}/page.tsx`, i.label] as [string, string]),
  ...settingsNavFor('agency', flags).flatMap((s) => s.items).map((i) => [`(app)${i.href}/page.tsx`, i.label] as [string, string]),
  ...navFor('platform', flags, null).flatMap((s) => s.items).map((i) => [`(platform)${i.href}/page.tsx`, i.label] as [string, string]),
];

/** Pages outside the menus with a fixed title. */
const otherPages: [file: string, label: string][] = [
  ['(app)/agency/clients/new/page.tsx', 'Add a client'],
  ['(app)/agency/prospects/new/page.tsx', 'Add a prospect'],
  ['(platform)/platform/knowledge/new/page.tsx', 'New article'],
  ['(platform)/platform/health/page.tsx', 'Health'],
  ['(app)/inbox/page.tsx', 'Inbox'],
  ['(app)/settings/notifications/page.tsx', 'Notification settings'],
];

/** Detail pages: the title comes from the record (`generateMetadata`, sharing the page's cached read). */
const detailPages = [
  '(app)/agency/approvals/[briefId]/page.tsx',
  '(app)/agency/prospects/[clientId]/page.tsx',
  '(platform)/platform/agencies/[id]/page.tsx',
  '(platform)/platform/knowledge/[id]/page.tsx',
  '(platform)/platform/ask/[threadId]/page.tsx',
  '(app)/kb/[id]/page.tsx',
];

function pagesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(here, dir))) {
      const path = `${dir}/${name}`;
      if (statSync(join(here, path)).isDirectory()) walk(path);
      else if (name === 'page.tsx' || name === 'layout.tsx') out.push(path);
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

  it.each([...menuPages, ...otherPages])('%s: PageHeader title and metadata.title are "%s"', (file, label) => {
    const source = read(file);
    expect(source).toMatch(headerTitle(label));
    expect(source).toMatch(metadataTitle(label));
  });

  it.each(detailPages)('%s: a PageHeader with a breadcrumb and generateMetadata', (file) => {
    const source = read(file);
    expect(source).toMatch(/<PageHeader[^>]*\bbreadcrumb=/);
    expect(source).toContain('export async function generateMetadata');
  });

  it('the wizards show their step', () => {
    expect(read('(app)/agency/clients/new/page.tsx')).toMatch(/<PageHeader[^>]*\bstep=\{\{ n: 1, of: \d \}\}/);
    expect(read('(app)/onboarding/page.tsx')).toMatch(/<PageHeader[^>]*\bstep=\{/);
  });

  it('no touched page or layout renders its own h1 (PageHeader owns it)', () => {
    const files = ['(app)/agency', '(platform)/platform', '(app)/inbox', '(app)/settings', '(app)/kb', '(app)/onboarding'].flatMap(pagesUnder);
    expect(files.length).toBeGreaterThan(30);
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
