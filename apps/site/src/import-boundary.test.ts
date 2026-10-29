// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
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

/** Content modules that carry every rival / vendor / source entry, enabled or not: server-only by convention. */
const SERVER_CONTENT = new Set(['content/pages.ts', 'content/compare.ts', 'content/integrations.ts', 'content/sources.ts']);

/** Relative specifiers a module imports as values (`import type …` and `export type …` lines are erased by the compiler). */
function valueImports(source: string): string[] {
  const stripped = source.replace(/\b(?:import|export)\s+type\b[^;]*?from\s*['"][^'"]+['"]/g, '');
  return importSpecifiers(stripped).filter((s) => s.startsWith('.'));
}

function resolveRelative(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Every path (site-relative) from a `'use client'` module to a server-content module, following value imports. */
function clientLeaks(entries: string[], read: (abs: string) => string, toRel: (abs: string) => string, resolveSpec = resolveRelative): string[] {
  const leaks: string[] = [];
  for (const entry of entries) {
    const seen = new Set<string>();
    const stack: { file: string; chain: string[] }[] = [{ file: entry, chain: [toRel(entry)] }];
    while (stack.length > 0) {
      const { file, chain } = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const r = toRel(file);
      if (SERVER_CONTENT.has(r)) {
        leaks.push(chain.join(' -> '));
        continue;
      }
      for (const spec of valueImports(read(file))) {
        const next = resolveSpec(file, spec);
        if (next) stack.push({ file: next, chain: [...chain, toRel(next)] });
      }
    }
  }
  return leaks;
}

const isClient = (source: string) => /^\s*['"]use client['"]/.test(source);

describe('client modules stay off the server-only content', () => {
  it('matcher: value imports are followed, type imports are not', () => {
    const files: Record<string, string> = {
      'src/a.tsx': "'use client';\nimport { x } from './b';\nimport type { T } from '../content/pages';",
      'src/b.ts': "export { y } from '../content/compare';",
    };
    const resolveFake = (from: string, spec: string) => {
      const target = join(dirname(from), spec).split(sep).join('/');
      return Object.keys(files).find((k) => k === `${target}.ts` || k === `${target}.tsx`) ?? (`${target}.ts` === 'content/compare.ts' ? 'content/compare.ts' : null);
    };
    const leaks = clientLeaks(['src/a.tsx'], (f) => files[f] ?? '', (f) => f, resolveFake);
    expect(leaks).toEqual(['src/a.tsx -> src/b.ts -> content/compare.ts']);
    expect(valueImports("import type { NavLink } from './nav-items';")).toEqual([]);
  });

  it("no 'use client' module imports content/pages, compare, integrations or sources (directly or transitively)", () => {
    const clients = walk(join(SITE_ROOT, 'src')).filter((p) => isClient(readFileSync(p, 'utf8')));
    expect(clients.length).toBeGreaterThan(5);
    expect(clientLeaks(clients, (f) => readFileSync(f, 'utf8'), rel)).toEqual([]);
  });
});
