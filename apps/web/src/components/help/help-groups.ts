/**
 * 15b-1: groups a context's page guides by its menu sections for the Help page. Pure and client-safe, like `nav-items`.
 * A guide belongs to the menu item whose page id (`pageIdOf`) equals its help key (`page:<id>`); settings tabs fall under
 * one "Settings" group; guides matching no menu item (a hidden page, a retired one) go under "Other".
 */
import { type NavContext, type NavSection, pageIdOf } from '@/components/shell/nav-items';

export interface HelpGuide { helpKey: string; title: string; articleId: string }
export interface HelpGroup { heading: string; guides: HelpGuide[] }

const idOf = (g: HelpGuide) => g.helpKey.replace(/^page:/, '');

export function groupGuides(context: NavContext, menu: NavSection[], settings: NavSection[], guides: HelpGuide[]): HelpGroup[] {
  const byPage = new Map(guides.map((g) => [idOf(g), g]));
  const used = new Set<string>();
  const sections: { heading: string; hrefs: string[] }[] = [
    ...menu.map((s) => ({ heading: s.label ?? 'General', hrefs: s.items.map((i) => i.href) })),
    { heading: 'Settings', hrefs: settings.flatMap((s) => s.items.map((i) => i.href)) },
  ];
  const groups: HelpGroup[] = [];
  for (const s of sections) {
    const found: HelpGuide[] = [];
    for (const href of s.hrefs) {
      const id = pageIdOf(context, href);
      const g = byPage.get(id);
      if (g && !used.has(id)) {
        used.add(id);
        found.push(g);
      }
    }
    if (!found.length) continue;
    const existing = groups.find((x) => x.heading === s.heading);
    if (existing) existing.guides.push(...found);
    else groups.push({ heading: s.heading, guides: found });
  }
  const other = guides.filter((g) => !used.has(idOf(g)));
  if (other.length) groups.push({ heading: 'Other', guides: other });
  return groups;
}
