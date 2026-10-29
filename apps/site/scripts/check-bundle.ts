/**
 * Post-build boundary check (plan P9, Review Focus 1). Run after `next build`:
 * fails if any server package — or `@cs/email` source other than `branding.ts` — reached the
 * site's build output (`.next/static/**`, `.next/server/**\/*.js`) or its file traces (`*.nft.json`).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const NEXT_DIR = join(SITE_ROOT, '.next');

const FORBIDDEN = [
  /(?:packages|@cs)\/(?:db|tools|worker|engine|ai|ask|billing|collectors|evals|mcp|storage|verticals|demo)\//,
  /(?:packages|@cs)\/email\/src\/(?!branding\.ts)/,
];

/** Data-vendor names must not appear in prerendered pages (plan P12); JS chunks are not scanned for names. */
const VENDOR_NAMES = /dataforseo|apify|scrapecreators|stadia/i;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Normalises Windows separators (raw and JSON/JS-escaped) so one pattern covers both. */
const normalise = (s: string) => s.replace(/\\\\/g, '/').replace(/\\/g, '/');

function offenders(text: string): string[] {
  const norm = normalise(text);
  return FORBIDDEN.flatMap((re) => {
    const m = norm.match(re);
    if (!m || m.index === undefined) return [];
    return [norm.slice(Math.max(0, m.index - 20), m.index + 80).replace(/\s+/g, ' ')];
  });
}

if (!existsSync(NEXT_DIR)) {
  console.error('check:bundle: .next not found — run `pnpm --filter @cs/site build` first.');
  process.exit(1);
}

const all = walk(NEXT_DIR).map((p) => ({ abs: p, rel: relative(NEXT_DIR, p).split(sep).join('/') }));
const scanned = all.filter(({ rel }) => rel.startsWith('static/') || (rel.startsWith('server/') && rel.endsWith('.js')) || rel.endsWith('.nft.json'));

const problems: string[] = [];
for (const { abs, rel } of scanned) {
  for (const hit of offenders(rel)) problems.push(`${rel}: path matches (${hit})`);
  if (/\.(js|mjs|cjs|json|css|map|html)$/.test(rel)) {
    for (const hit of offenders(readFileSync(abs, 'utf8'))) problems.push(`${rel}: references …${hit}…`);
  }
}

const prerendered = all.filter(({ rel }) => rel.startsWith('server/app/') && /[.](html|rsc|body|meta)$/.test(rel));
for (const { abs, rel } of prerendered) {
  const m = readFileSync(abs, 'utf8').match(VENDOR_NAMES);
  if (m) problems.push(`${rel}: names a data vendor (${m[0]})`);
}

if (problems.length > 0) {
  console.error(`check:bundle: ${problems.length} forbidden reference(s) in the site build:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check:bundle: ok (${scanned.length} files scanned, ${prerendered.length} prerendered files checked for vendor names, no server package in the site build)`);
