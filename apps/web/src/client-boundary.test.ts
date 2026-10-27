import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Phase 16 final fix: on the server, every export of a `'use client'` module is a client *reference*. Rendering a
 * component from one (or passing a reference on as a prop) is fine; *calling* a function from one throws at render time
 * in a production build ("Attempted to call welcomeLine() from the server…"), while unit tests (which ignore the
 * directive) stay green. So a module without `'use client'` never calls a non-component import (PascalCase names are
 * components) of a local `'use client'` module. Put shared helpers and copy in a plain module both sides import.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function isClient(sf: ts.SourceFile): boolean {
  for (const s of sf.statements) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) break;
    if (s.expression.text === 'use client') return true;
  }
  return false;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const componentLike = (name: string) => /^[A-Z]/.test(name) && !/^[A-Z0-9_]+$/.test(name);

describe('client boundary', () => {
  it('server modules never call a function imported from a "use client" module', () => {
    const files = walk(SRC);
    const client = new Map<string, boolean>();
    const clientFile = (f: string) => {
      if (!client.has(f)) client.set(f, isClient(parse(f)));
      return client.get(f) as boolean;
    };
    const bad: string[] = [];
    for (const file of files) {
      const sf = parse(file);
      if (isClient(sf)) continue;
      const fromClient = new Map<string, string>();
      for (const st of sf.statements) {
        if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
        const clause = st.importClause;
        if (!clause || clause.isTypeOnly) continue;
        const target = resolveLocal(file, st.moduleSpecifier.text);
        if (!target || !clientFile(target)) continue;
        const named = clause.namedBindings;
        if (named && ts.isNamespaceImport(named)) fromClient.set(named.name.text, st.moduleSpecifier.text);
        if (named && ts.isNamedImports(named)) {
          for (const el of named.elements) if (!el.isTypeOnly && !componentLike(el.name.text)) fromClient.set(el.name.text, st.moduleSpecifier.text);
        }
      }
      if (fromClient.size === 0) continue;
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) || ts.isTaggedTemplateExpression(n)) {
          const callee = ts.isCallExpression(n) ? n.expression : n.tag;
          const root = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? callee.expression : callee;
          if (ts.isIdentifier(root) && fromClient.has(root.text)) bad.push(`${relative(SRC, file)}: calls ${callee.getText(sf)}() from ${fromClient.get(root.text)}`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(bad).toEqual([]);
  });
});
