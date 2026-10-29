import ts from 'typescript';
import { hashText } from '../text.js';
import type { CopyItem, SourceRule } from '../types.js';
import { isCopyLike, isDroppedName } from './filters.js';

export type TsScanRule = Pick<SourceRule, 'surface' | 'mode' | 'properties'>;

export interface RawLiteral {
  text: string;
  line: number;
  /** Dotted property path from the outermost variable (`a.b[0].c`). */
  scope: string;
}

export function parseTs(file: string, source: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function propName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function substitutionName(e: ts.Expression): string {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e)) return substitutionName(e.expression);
  return '…';
}

/** Text of a string / template literal node, substitutions rendered as `{name}`; undefined for other nodes. */
export function literalText(n: ts.Node): string | undefined {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) {
    return n.head.text + n.templateSpans.map((s) => `{${substitutionName(s.expression)}}` + s.literal.text).join('');
  }
  return undefined;
}

function rootIdent(e: ts.Expression): string | undefined {
  let cur: ts.Expression = e;
  for (;;) {
    if (ts.isIdentifier(cur)) return cur.text;
    if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur) || ts.isNonNullExpression(cur)) cur = cur.expression;
    else if (ts.isCallExpression(cur)) cur = cur.expression;
    else return undefined;
  }
}

/** True when the node sits inside a position that is never copy (imports, types, console/logger/z/sql, throw). */
export function inDroppedContext(node: ts.Node): boolean {
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isTypeNode(p)) return true;
    if (ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isThrowStatement(p)) return true;
    if (ts.isCallExpression(p)) {
      const root = rootIdent(p.expression);
      if (root === 'console' || root === 'logger' || root === 'z') return true;
    }
    if (ts.isTaggedTemplateExpression(p) && /^sql\b/.test(p.tag.getText())) return true;
    if (ts.isPropertyAssignment(p)) {
      const n = propName(p.name);
      if (n !== undefined && isDroppedName(n)) return true;
    }
  }
  return false;
}

function pathJoin(path: string[]): string {
  return path.reduce((acc, seg) => (seg.startsWith('[') ? acc + seg : acc ? `${acc}.${seg}` : seg), '');
}

/**
 * Module mode: string / template literals that are a property-assignment value or array element (also when wrapped in
 * a call, conditional, `as`, etc. inside one), anywhere in the file. Reused by the jsx mode for object literals in .tsx.
 */
export function collectModuleLiterals(sf: ts.SourceFile): RawLiteral[] {
  const out: RawLiteral[] = [];
  const path: string[] = [];

  const emit = (node: ts.Node, text: string) => {
    if (inDroppedContext(node)) return;
    out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, scope: pathJoin(path) });
  };

  const visit = (node: ts.Node, inValue: boolean): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer) {
        path.push(ts.isIdentifier(node.name) ? node.name.text : '…');
        visit(node.initializer, inValue);
        path.pop();
      }
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      path.push(propName(node.name) ?? '…');
      visit(node.initializer, true);
      path.pop();
      return;
    }
    if (ts.isShorthandPropertyAssignment(node)) return;
    if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((el, i) => {
        path.push(`[${i}]`);
        visit(el, true);
        path.pop();
      });
      return;
    }
    const text = literalText(node);
    if (text !== undefined) {
      if (inValue) emit(node, text);
      if (ts.isTemplateExpression(node)) node.templateSpans.forEach((s) => visit(s.expression, inValue));
      return;
    }
    ts.forEachChild(node, (c) => visit(c, inValue));
  };

  visit(sf, false);
  return out;
}

/** Property mode: string values of properties named in `names` (also through conditionals / calls inside the value). */
export function collectPropertyLiterals(sf: ts.SourceFile, names: ReadonlySet<string>): RawLiteral[] {
  const out: RawLiteral[] = [];
  const path: string[] = [];
  const visit = (node: ts.Node, capture: boolean): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isVariableDeclaration(node)) {
      path.push(ts.isIdentifier(node.name) ? node.name.text : '…');
      if (node.initializer) visit(node.initializer, false);
      path.pop();
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      const n = propName(node.name);
      path.push(n ?? '…');
      visit(node.initializer, n !== undefined && names.has(n));
      path.pop();
      return;
    }
    if (ts.isShorthandPropertyAssignment(node)) return;
    const text = literalText(node);
    if (text !== undefined) {
      if (capture && !inDroppedContext(node)) {
        out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, scope: pathJoin(path) });
      }
      return;
    }
    // A nested object literal under a captured property is not itself a value of that property.
    ts.forEachChild(node, (c) => visit(c, capture && !ts.isObjectLiteralExpression(node)));
  };
  visit(sf, false);
  return out;
}

/** Filter with isCopyLike and assign stable anchors (`file#scope#n`, n = index among kept items of the same scope). */
export function toCopyItems(file: string, rule: Pick<SourceRule, 'surface'>, raws: RawLiteral[]): CopyItem[] {
  const counts = new Map<string, number>();
  const items: CopyItem[] = [];
  for (const r of raws) {
    if (!isCopyLike(r.text)) continue;
    const n = counts.get(r.scope) ?? 0;
    counts.set(r.scope, n + 1);
    items.push({
      surface: rule.surface,
      file,
      line: r.line,
      anchor: `${file}#${r.scope}#${n}`,
      context: r.scope,
      text: r.text,
      hash: hashText(r.text),
      kind: 'string',
    });
  }
  return items;
}

export function scanTsFile(file: string, source: string, rule: TsScanRule): CopyItem[] {
  const sf = parseTs(file, source);
  switch (rule.mode) {
    case 'module':
      return toCopyItems(file, rule, collectModuleLiterals(sf));
    case 'property':
      return toCopyItems(file, rule, collectPropertyLiterals(sf, new Set(rule.properties ?? [])));
    default:
      throw new Error(`scanTsFile: mode '${rule.mode}' not implemented`);
  }
}
