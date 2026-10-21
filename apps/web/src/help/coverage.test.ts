import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PAGE_COPY, resolveTip } from './copy';

/**
 * Phase 15b-2 gate (P3): the help wave stays complete. Statically scans every `page.tsx`:
 *  - a file with `<PageHeader` passes `helpKey=` (unless exempt) and the key names a `PAGE_COPY` page;
 *  - every key has a guide for each audience that can reach the page (exact audience or `all`), and no guide for an
 *    audience that cannot (a client guide on an agency-only page would leak agency pages' help to client roles);
 *  - every guide belongs to a page that uses its key;
 *  - every `tip=` literal and `tip:` data literal under `apps/web/src` resolves in `PAGE_COPY`.
 * All gaps are reported in one failure.
 */
const SRC = join(__dirname, '..');
const APP = join(SRC, 'app');
const ROOT = join(__dirname, '..', '..', '..', '..');
const GUIDES = join(ROOT, 'docs', 'help', 'pages');

type Audience = 'agency' | 'client' | 'operator';

/** Help/KB hubs that list guides rather than being one. */
const EXEMPT = ['/platform/help', '/agency/help', '/c/[clientId]/help', '/kb/[id]'];
/** `/c/[clientId]` pages that 404 client roles: agency guide only. */
const AGENCY_ONLY_CLIENT_PAGES = ['/c/[clientId]/pitch-snapshot', '/c/[clientId]/settings/delivery', '/c/[clientId]/settings/runbook'];
/** `/c/[clientId]` pages only the client owner reaches (agency staff 404): client guide only. */
const CLIENT_ONLY_CLIENT_PAGES = ['/c/[clientId]/settings/billing'];
/** Routes outside /c, /agency and /platform that show a PageHeader, with who reaches them. */
const ACCOUNT_ROUTES: Record<string, Audience[]> = {
  '/inbox': ['agency', 'client'],
  '/settings/notifications': ['agency', 'client'],
  '/onboarding': ['agency'],
};
/** Components that render a page's PageHeader on its behalf (the route file only renders them), scanned explicitly. */
const DELEGATED_HEADERS: { file: string; route: string }[] = [
  { file: join(APP, '(app)', 'c', '[clientId]', 'ask', 'ask-screen.tsx'), route: '/c/[clientId]/ask' },
];

const rel = (f: string) => relative(ROOT, f).split(sep).join('/');

function walk(dir: string, match: (name: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, match, out);
    else if (match(name)) out.push(p);
  }
  return out;
}

const routeOf = (file: string) =>
  '/' + relative(APP, file).split(sep).filter((s) => !/^\(.*\)$/.test(s) && s !== 'page.tsx').join('/');

function reachable(route: string): Audience[] | null {
  if (route.startsWith('/c/[clientId]')) {
    if (AGENCY_ONLY_CLIENT_PAGES.includes(route)) return ['agency'];
    if (CLIENT_ONLY_CLIENT_PAGES.includes(route)) return ['client'];
    return ['agency', 'client'];
  }
  if (route.startsWith('/agency')) return ['agency'];
  if (route.startsWith('/platform')) return ['operator'];
  return ACCOUNT_ROUTES[route] ?? null;
}

/** The help keys a file passes to its PageHeader: the `HELP_KEY` constant, a `helpKey="page:…"` literal, or `helpKeyFor` returns. */
function keysIn(src: string): string[] {
  const keys = new Set<string>();
  for (const m of src.matchAll(/HELP_KEY\s*=\s*'(page:[a-z0-9.-]+)'/g)) keys.add(m[1]!);
  for (const m of src.matchAll(/helpKey="(page:[a-z0-9.-]+)"/g)) keys.add(m[1]!);
  for (const m of src.matchAll(/helpKeyFor\s*=[^\n]*\n?/g)) for (const k of m[0].matchAll(/'((?:client|agency|platform|account)\.[a-z0-9.-]+)'/g)) keys.add(`page:${k[1]}`);
  return [...keys];
}

interface Guide { file: string; key: string; audience: string }
function loadGuides(): Guide[] {
  return walk(GUIDES, (n) => n.endsWith('.md')).map((file) => {
    const fm = readFileSync(file, 'utf8').split(/\r?\n---/)[0]!;
    return { file: rel(file), key: /^help_key:\s*(\S+)/m.exec(fm)?.[1] ?? '', audience: /^audience:\s*(\S+)/m.exec(fm)?.[1] ?? '' };
  });
}

/** `tip="…"` JSX attributes and `tip: '…'` properties (data lists that feed `<HelpTip tip={…}>`). */
function tipLiterals(file: string): { line: number; key: string }[] {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { line: number; key: string }[] = [];
  const literals = (n: ts.Node): ts.StringLiteralLike[] => {
    if (ts.isStringLiteralLike(n)) return [n];
    if (ts.isConditionalExpression(n)) return [...literals(n.whenTrue), ...literals(n.whenFalse)];
    if (ts.isParenthesizedExpression(n)) return literals(n.expression);
    if (ts.isJsxExpression(n) && n.expression) return literals(n.expression);
    return [];
  };
  const visit = (n: ts.Node) => {
    let init: ts.Node | undefined;
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'tip') init = n.initializer;
    else if (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'tip') init = n.initializer;
    // A `tip:` property is only a help key when shaped like one (pill tooltips use the same property name for prose).
    const isProp = ts.isPropertyAssignment(n);
    if (init) for (const l of literals(init)) if (!isProp || /^(client|agency|platform|account)\.[A-Za-z0-9.-]+$/.test(l.text)) out.push({ line: sf.getLineAndCharacterOfPosition(l.getStart(sf)).line + 1, key: l.text });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export function findGaps(): string[] {
  const gaps: string[] = [];
  const guides = loadGuides();
  const used = new Map<string, { audiences: Audience[]; routes: string[] }>();

  const pages = [
    ...walk(APP, (n) => n === 'page.tsx').map((file) => ({ file, route: routeOf(file) })),
    ...DELEGATED_HEADERS,
  ];
  for (const { file, route } of pages) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('<PageHeader')) continue;
    if (EXEMPT.includes(route)) continue;
    const keys = keysIn(src);
    if (!/helpKey\s*[=:]/.test(src) || keys.length === 0) { gaps.push(`${rel(file)}: <PageHeader> without a recognisable helpKey (route ${route})`); continue; }
    const audiences = reachable(route);
    if (!audiences) { gaps.push(`${rel(file)}: route ${route} has no audience rule (add it to ACCOUNT_ROUTES)`); continue; }
    for (const key of keys) {
      const entry = used.get(key) ?? { audiences: [], routes: [] };
      entry.audiences = [...new Set([...entry.audiences, ...audiences])];
      entry.routes.push(route);
      used.set(key, entry);
    }
  }

  for (const [key, { audiences, routes }] of used) {
    if (!(key.slice('page:'.length) in PAGE_COPY)) gaps.push(`${key} (${routes[0]}): no PAGE_COPY entry`);
    const mine = guides.filter((g) => g.key === key);
    for (const a of audiences) {
      if (!mine.some((g) => g.audience === a || g.audience === 'all')) gaps.push(`${key} (${routes[0]}): no ${a} guide (add one with audience ${a} or all in docs/help/pages)`);
    }
    for (const g of mine) {
      const ok = g.audience === 'all' ? audiences.length > 1 || routes.some((r) => EXEMPT.includes(r)) : audiences.includes(g.audience as Audience);
      if (!ok) gaps.push(`${g.file}: audience "${g.audience}" cannot reach ${routes[0]} (reachable: ${audiences.join(', ')})`);
    }
  }
  for (const g of guides) {
    if (!used.has(g.key)) gaps.push(`${g.file}: ${g.key || '(no help_key)'} is not the helpKey of any page`);
  }

  for (const file of walk(SRC, (n) => /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) && !n.endsWith('.d.ts'))) {
    for (const { line, key } of tipLiterals(file)) {
      if (!resolveTip(key)) gaps.push(`${rel(file)}:${line}: tip "${key}" is not in PAGE_COPY`);
    }
  }
  return gaps;
}

describe('help coverage gate (P3)', () => {
  it('every page header has a help key, every key has the guides its audiences need, every tip resolves', () => {
    const gaps = findGaps();
    expect(gaps, `${gaps.length} help gap(s):\n${gaps.join('\n')}`).toEqual([]);
  });

  it('the declared page lists point at real routes', () => {
    const routes = new Set(walk(APP, (n) => n === 'page.tsx').map(routeOf));
    for (const r of [...AGENCY_ONLY_CLIENT_PAGES, ...CLIENT_ONLY_CLIENT_PAGES, ...EXEMPT, ...Object.keys(ACCOUNT_ROUTES)]) expect(routes.has(r), r).toBe(true);
  });
});
