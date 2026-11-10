import type { SitePage } from '../../content/pages';
import { CHOOSER } from '../../content/chooser';
import { SITE_URL } from '../../content/site';

// Deck § 7 `llms.txt intro` (docs/superpowers/specs/2026-11-10-site-audiences-copy.md).
const INTRO =
  'Rival Monday watches the competitors of local businesses using public information only and writes a weekly brief where every claim links to the evidence behind it. Agencies sell it under their own brand; local businesses get it through an agency.';

const SECTIONS: { heading: string; group: NonNullable<SitePage['group']> }[] = [
  { heading: 'Integrations', group: 'integrations' },
  { heading: 'Sources', group: 'sources' },
  { heading: 'Compare', group: 'compare' },
  { heading: 'Industries', group: 'industries' },
  { heading: 'Guides', group: 'guides' },
];

const line = (p: SitePage) => `- [${p.title}](${SITE_URL}${p.path}): ${p.description}`;

/** `llms.txt` from the page registry: sitemap pages only, ungrouped first, then each collection. */
export function buildLlmsTxt(pages: readonly SitePage[]): string {
  const listed = pages.filter((p) => p.sitemap);
  const home = pages.find((p) => p.path === '/');
  const out = ['# Rival Monday', '', `> ${CHOOSER.eyebrow}. ${home?.description ?? ''}`.trim(), '', INTRO, '', '## Pages', '', ...listed.filter((p) => !p.group).map(line)];
  for (const s of SECTIONS) {
    const items = listed.filter((p) => p.group === s.group);
    if (items.length > 0) out.push('', `## ${s.heading}`, '', ...items.map(line));
  }
  return out.join('\n') + '\n';
}
