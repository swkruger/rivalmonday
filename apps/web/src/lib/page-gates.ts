// Page-fix grep gates (15c-2a spec §5, gates 1-4), enforced over all of apps/web/src (15c-2b-2 T16);
// whole-file exemptions only in GATE_EXEMPT. AREAS_2A/2B are the history of the ratchet. Regexes are deliberately simple line matchers; a false positive is fixed
// with an escape comment that names its reason: `// format-gate: <reason>` or `{/* format-gate: <reason> */}`
// on the same or the previous line (an empty reason does not count).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface GateHit { file: string; line: number; gate: 'badge' | 'date' | 'enum' | 'km'; text: string }

/** Gate 1 allow-list: relative path (to apps/web/src) → reason the file uses <Badge> for something that is not a status. */
export const BADGE_ALLOW: Record<string, string> = {};

/** Gate 3: enum-ish fields that must never render raw as JSX text (use labelFor + StatusChip). */
export const ENUM_FIELDS: readonly string[] = ['status', 'billingState', 'state', 'toState', 'fromState', 'kind', 'role', 'health', 'source', 'channel'];

/** Every 2a folder/file, relative to apps/web/src (the final task asserts GATED_PATHS ⊇ this). */
export const AREAS_2A: readonly string[] = [
  'app/(platform)/platform',
  'app/(app)/agency',
  'app/(app)/inbox',
  'app/(app)/settings',
  'app/(onboarding)',
  'app/(app)/kb',
  'app/(app)/paused',
  'app/sign-up',
  'app/sign-in',
  'app/start',
  'app/join',
  'app/link-expired',
  'app/link-other-account',
  'app/no-access',
  'app/u',
  'app/oauth',
  'app/onboarding',
  'components/agency',
  'components/runbook',
  'components/kb',
  'components/billing',
  'components/ai-connections.tsx',
  'components/support-sessions-table.tsx',
  'components/shell',
];

/** 15c-2b files, each appended by the task that creates it (ratchet continues; the full-`src` run is 2b-2). */
export const AREAS_2B: string[] = ['components/whole-page-diff.tsx', 'components/list-detail.tsx', 'components/list-detail-sheet.tsx', 'components/charts/line-chart.tsx', 'components/charts/rank-trend.tsx', 'app/(app)/c/[clientId]/page.tsx', 'app/(app)/c/[clientId]/overview-kpis.ts', 'app/(app)/c/[clientId]/layout.tsx', 'app/(app)/c/[clientId]/help', 'components/client-lists.tsx', 'components/starting-point-card.tsx', 'components/stat-card.tsx', 'components/pressure-badge.tsx', 'components/client-home-basic.tsx', 'app/(app)/c/[clientId]/changes', 'app/(app)/c/[clientId]/moves', 'app/(app)/c/[clientId]/competitors/page.tsx', 'app/(app)/c/[clientId]/competitors/competitor-controls.tsx', 'app/(app)/c/[clientId]/competitors/actions.ts', 'app/(app)/c/[clientId]/competitors/search-state.ts', 'components/rival', 'app/(app)/c/[clientId]/competitors/[competitorId]', 'app/(app)/c/[clientId]/pricing', 'app/(app)/c/[clientId]/ads', 'app/(app)/c/[clientId]/reviews', 'components/place-summary.tsx', 'app/(app)/c/[clientId]/rankings', 'app/(app)/c/[clientId]/recommendations', 'components/recommendation-board.tsx', 'app/(app)/c/[clientId]/briefs', 'app/(app)/c/[clientId]/alerts', 'components/views/brief-view.tsx', 'components/views/alert-view.tsx', 'components/views/scorecard.tsx', 'app/(app)/c/[clientId]/reports', 'app/(app)/c/[clientId]/pitch-snapshot', 'components/views/report-view.tsx', 'components/prospect-landscape.tsx', 'app/(app)/c/[clientId]/evidence', 'app/(app)/c/[clientId]/ask', 'components/ask', 'app/(onboarding)/c/[clientId]/setup', 'app/(app)/c/[clientId]/settings', 'components/client-profile-form.tsx', 'components/services-area-summary.tsx', 'app/(app)/agency/settings/usage/questions-cell.tsx'];

/** Whole files the gates skip: non-UI code whose source contains the patterns on purpose. Path relative to apps/web/src → reason. */
export const GATE_EXEMPT: Record<string, string> = {
  'lib/page-gates.ts': "the gates' own patterns (e.g. /<Badge\\b/) are string literals",
};

/** All of apps/web/src (tests and lib/format/** still skipped). */
export const GATED_PATHS: string[] = ['.'];

const ESCAPE = /format-gate:\s*\S/;
const DATE_RE = /\.slice\(\s*0\s*,\s*10\s*\)|toLocaleDateString\(|toLocaleTimeString\(|toLocaleString\(|toISOString\(\)/;
const ENUM_RE = new RegExp(`(?<![=\\w$])\\{\\s*[\\w.?!\\[\\]]*\\.(?:${ENUM_FIELDS.join('|')})\\s*\\}`);
const KM_STRING_RE = /(["'`])(?:(?!\1).)*\bkm\b(?:(?!\1).)*\1/i;
const KM_JSX_TEXT_RE = />[^<>{}]*\bkm\b[^<>{}]*</i;
const KM_WORD_RE = /\bkm\b/i;

function escaped(lines: string[], i: number): boolean {
  return ESCAPE.test(lines[i] ?? '') || ESCAPE.test(lines[i - 1] ?? '');
}

function isCommentLine(l: string): boolean {
  const t = l.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/** Pure scan of one source file: gates 1-3 (+4 on JSX text and string literals of .tsx). `file` is relative to apps/web/src. */
export function scanSource(file: string, src: string): GateHit[] {
  const norm = file.split(sep).join('/');
  const tsx = norm.endsWith('.tsx');
  const lines = src.split('\n');
  const hits: GateHit[] = [];
  lines.forEach((l, i) => {
    if (isCommentLine(l) || escaped(lines, i)) return;
    const add = (gate: GateHit['gate']) => hits.push({ file: norm, line: i + 1, gate, text: l.trim() });
    if (/<Badge\b/.test(l) && !(norm in BADGE_ALLOW)) add('badge');
    if (tsx && DATE_RE.test(l)) add('date');
    if (ENUM_RE.test(l)) add('enum');
    if (tsx && (KM_STRING_RE.test(l) || KM_JSX_TEXT_RE.test(l))) add('km');
  });
  return hits;
}

/** Gate 4 for help copy (`help/copy/*.ts`) and guides (`docs/help/pages/*.md`): the word km anywhere. */
export function scanHelpText(file: string, src: string): GateHit[] {
  const lines = src.split('\n');
  const hits: GateHit[] = [];
  lines.forEach((l, i) => {
    if (KM_WORD_RE.test(l) && !escaped(lines, i)) hits.push({ file: file.split(sep).join('/'), line: i + 1, gate: 'km', text: l.trim() });
  });
  return hits;
}

/** apps/web/src */
export const SRC_ROOT = join(__dirname, '..');
const DOCS_GUIDES = join(SRC_ROOT, '..', '..', '..', 'docs', 'help', 'pages');
const HELP_COPY = join(SRC_ROOT, 'help', 'copy');

function walk(p: string, out: string[] = []): string[] {
  let st;
  try { st = statSync(p); } catch { return out; }
  if (st.isFile()) { out.push(p); return out; }
  for (const e of readdirSync(p)) walk(join(p, e), out);
  return out;
}

/** Source files (.ts/.tsx, no tests, no lib/format/**) under the given paths relative to apps/web/src. */
export function sourceFilesUnder(paths: readonly string[]): string[] {
  const files: string[] = [];
  for (const p of paths) {
    for (const f of walk(join(SRC_ROOT, p))) {
      const rel = relative(SRC_ROOT, f).split(sep).join('/');
      if (!/\.tsx?$/.test(rel) || /\.test\./.test(rel) || rel.startsWith('lib/format/') || rel in GATE_EXEMPT) continue;
      files.push(rel);
    }
  }
  return files;
}

export function scanPaths(paths: readonly string[]): GateHit[] {
  return sourceFilesUnder(paths).flatMap((rel) => scanSource(rel, readFileSync(join(SRC_ROOT, rel), 'utf8')));
}

/** Gate 4 over every help copy file and guide (enforced from T2). */
export function scanAllHelpText(): GateHit[] {
  const hits: GateHit[] = [];
  for (const f of walk(HELP_COPY)) {
    if (/\.ts$/.test(f) && !/\.test\./.test(f)) hits.push(...scanHelpText(relative(SRC_ROOT, f), readFileSync(f, 'utf8')));
  }
  for (const f of walk(DOCS_GUIDES)) {
    if (f.endsWith('.md')) hits.push(...scanHelpText(`docs/help/pages/${relative(DOCS_GUIDES, f)}`, readFileSync(f, 'utf8')));
  }
  return hits;
}
