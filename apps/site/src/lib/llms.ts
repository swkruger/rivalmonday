import type { SitePage } from '../../content/pages';
import { SITE_URL, TITLE_STEM } from '../../content/site';

// Draft copy: owner signs the intro paragraph.
const INTRO =
  'Rival Monday gives agencies a white-label service for their local-service clients: a weekly brief on competitors, built only from public information, where every claim links to the evidence behind it.';

const SECTIONS: { heading: string; group: NonNullable<SitePage['group']> }[] = [
  { heading: 'Integrations', group: 'integrations' },
  { heading: 'Sources', group: 'sources' },
  { heading: 'Compare', group: 'compare' },
];

const line = (p: SitePage) => `- [${p.title}](${SITE_URL}${p.path}): ${p.description}`;

/** `llms.txt` from the page registry: sitemap pages only, ungrouped first, then each collection. */
export function buildLlmsTxt(pages: readonly SitePage[]): string {
  const listed = pages.filter((p) => p.sitemap);
  const home = pages.find((p) => p.path === '/');
  const out = ['# Rival Monday', '', `> ${TITLE_STEM}. ${home?.description ?? ''}`.trim(), '', INTRO, '', '## Pages', '', ...listed.filter((p) => !p.group).map(line)];
  for (const s of SECTIONS) {
    const items = listed.filter((p) => p.group === s.group);
    if (items.length > 0) out.push('', `## ${s.heading}`, '', ...items.map(line));
  }
  return out.join('\n') + '\n';
}
