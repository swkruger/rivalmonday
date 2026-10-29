// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Plan P9 / Review Focus 1: the marketing site holds no secrets and reaches no server package.
 * Only `@cs/ui` (and its stylesheet) may be imported; only public env vars may be read.
 */
const SITE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = fileURLToPath(import.meta.url);

const ALLOWED_WORKSPACE_DEPS = ['@cs/ui'];
const ALLOWED_CS_SPECIFIERS = new Set(['@cs/ui', '@cs/ui/styles.css']);
const ALLOWED_ENV = /^(NEXT_PUBLIC_[A-Z0-9_]+|VERCEL_ENV|NODE_ENV)$/;
/** Source-map upload only (Task 14): readable in `next.config.ts`, nowhere else. */
const CONFIG_ONLY_ENV = /^(SENTRY_AUTH_TOKEN|SENTRY_ORG|SENTRY_PROJECT)$/;
const CONFIG_FILE = 'next.config.ts';

const SPECIFIER_PATTERNS = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g, // import x from 'a' / export { x } from 'a'
  /\bimport\s*['"]([^'"]+)['"]/g, // import 'a'
  /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g, // import('a') / require('a')
];

function importSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const re of SPECIFIER_PATTERNS) for (const m of source.matchAll(re)) out.push(m[1]!);
  return out;
}

/** Violations in one file, `file` relative to the site root with `/` separators. */
function boundaryViolations(file: string, source: string): string[] {
  const problems: string[] = [];
  for (const spec of importSpecifiers(source)) {
    if (spec === 'server-only') problems.push(`${file}: imports 'server-only'`);
    else if (spec.startsWith('@cs/') && !ALLOWED_CS_SPECIFIERS.has(spec)) problems.push(`${file}: imports '${spec}'`);
  }
  for (const m of source.matchAll(/process\.env\b(\s*\.\s*([A-Za-z_$][\w$]*))?/g)) {
    const name = m[2];
    if (!name) problems.push(`${file}: non-literal process.env access`);
    else if (ALLOWED_ENV.test(name)) continue;
    else if (CONFIG_ONLY_ENV.test(name) && file === CONFIG_FILE) continue;
    else problems.push(`${file}: reads process.env.${name}`);
  }
  return problems;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx|mjs)$/.test(name) ? [path] : [];
  });
}

function siteSources(): string[] {
  const roots = ['src', 'content', 'scripts'].flatMap((d) => walk(join(SITE_ROOT, d)));
  const top = [CONFIG_FILE, 'instrumentation-client.ts'].map((f) => join(SITE_ROOT, f)).filter((p) => existsSync(p));
  return [...roots, ...top].filter((p) => p !== SELF);
}

const rel = (path: string) => relative(SITE_ROOT, path).split(sep).join('/');

describe('site import boundary', () => {
  it('only @cs/ui as a workspace dependency', () => {
    const pkg = JSON.parse(readFileSync(join(SITE_ROOT, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
    const workspace = Object.entries(all).filter(([name, v]) => v.startsWith('workspace:') || name.startsWith('@cs/')).map(([name]) => name);
    expect(workspace.filter((n) => !ALLOWED_WORKSPACE_DEPS.includes(n))).toEqual([]);
  });

  it('no forbidden @cs import in any site source', () => {
    // Sanity: the matcher catches what it must.
    expect(boundaryViolations('src/x.ts', "import x from '@cs/db';")).toEqual(["src/x.ts: imports '@cs/db'"]);
    expect(boundaryViolations('src/x.ts', "import { a,\n b } from '@cs/email';")).toHaveLength(1);
    expect(boundaryViolations('src/x.ts', "export * from '@cs/tools/waitlist';")).toHaveLength(1);
    expect(boundaryViolations('src/x.ts', "const m = await import('@cs/core');")).toHaveLength(1);
    expect(boundaryViolations('src/x.ts', "import 'server-only';")).toEqual(["src/x.ts: imports 'server-only'"]);
    expect(boundaryViolations('src/x.ts', "import { Button } from '@cs/ui';\nimport '@cs/ui/styles.css';")).toEqual([]);

    const files = siteSources();
    expect(files.length).toBeGreaterThan(0);
    const problems = files.flatMap((p) => boundaryViolations(rel(p), readFileSync(p, 'utf8')));
    expect(problems).toEqual([]);
  });

  it('reads only public env', () => {
    expect(boundaryViolations('src/x.ts', 'process.env.NEXT_PUBLIC_APP_URL; process.env.VERCEL_ENV; process.env.NODE_ENV')).toEqual([]);
    expect(boundaryViolations('next.config.ts', 'process.env.SENTRY_AUTH_TOKEN')).toEqual([]);
    expect(boundaryViolations('src/lib/env.ts', 'process.env.SENTRY_AUTH_TOKEN')).toEqual(['src/lib/env.ts: reads process.env.SENTRY_AUTH_TOKEN']);
    expect(boundaryViolations('instrumentation-client.ts', 'process.env.SENTRY_ORG')).toHaveLength(1);
    expect(boundaryViolations('src/x.ts', 'process.env.DATABASE_URL')).toHaveLength(1);
    expect(boundaryViolations('src/x.ts', "process.env['NEXT_PUBLIC_X']")).toEqual(['src/x.ts: non-literal process.env access']);
    expect(boundaryViolations('src/x.ts', 'const { A } = process.env;')).toHaveLength(1);
    // The real sources (covered by the scan above, asserted here for the env rule's name).
    const problems = siteSources().flatMap((p) => boundaryViolations(rel(p), readFileSync(p, 'utf8')).filter((s) => s.includes('process.env')));
    expect(problems).toEqual([]);
  });
});
