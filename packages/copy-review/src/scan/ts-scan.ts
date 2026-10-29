import ts from 'typescript';
import { hashText } from '../text.js';
import type { CopyItem, SourceRule } from '../types.js';
import { isCopyLike, isDroppedName, KEEP_JSX_ATTRS } from './filters.js';

export type TsScanRule = Pick<SourceRule, 'surface' | 'mode' | 'properties' | 'calls' | 'constants'>;

export interface RawLiteral {
  text: string;
  line: number;
  /** Dotted property path from the outermost variable (`a.b[0].c`). */
  scope: string;
  /** Source position, used for ordering and de-duplication when scans are merged. */
  pos: number;
  /** Human hint overriding the scope (jsx: `<Tag attr>` / parent tag). */
  context?: string;
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

/** Call roots whose string arguments are never copy (`console.x`, `logger.x`, `log.x`, `z.` schema chains). */
const DROP_CALL_ROOTS: ReadonlySet<string> = new Set(['console', 'logger', 'log', 'z']);
/** Objects whose method calls are logging, wherever they hang (`this.logger.x`, `deps.logger.x`, `ctx.log.x`). */
const LOGGER_OBJECTS: ReadonlySet<string> = new Set(['console', 'logger', 'log']);
/** Built-in error constructors: their messages are for developers (`new Error('…')` anywhere, thrown or not). */
const ERROR_CTORS: ReadonlySet<string> = new Set(['Error', 'TypeError', 'RangeError']);
/** Methods whose literal arguments are compared, never shown (`.includes('x')`). */
const MATCH_METHODS: ReadonlySet<string> = new Set(['includes', 'startsWith', 'endsWith', 'has', 'indexOf']);
const EQUALITY_OPS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
]);

function isLoggerCall(call: ts.CallExpression): boolean {
  const root = rootIdent(call.expression);
  if (root !== undefined && DROP_CALL_ROOTS.has(root)) return true;
  if (!ts.isPropertyAccessExpression(call.expression)) return false;
  const obj = call.expression.expression;
  const objName = ts.isIdentifier(obj) ? obj.text : ts.isPropertyAccessExpression(obj) ? obj.name.text : undefined;
  return objName !== undefined && LOGGER_OBJECTS.has(objName);
}

const isMatchCall = (e: ts.Node): e is ts.CallExpression =>
  ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && MATCH_METHODS.has(e.expression.name.text);

/**
 * A literal used only as a comparison operand: `x === 'a'`, `case 'a':`, `.includes('a')`, or an element of the array
 * a `.includes(...)` is called on. Such strings are matched against, never shown.
 */
function isComparedLiteral(node: ts.Node): boolean {
  let cur = node;
  while (ts.isParenthesizedExpression(cur.parent) || ts.isAsExpression(cur.parent)) cur = cur.parent;
  const p = cur.parent;
  if (!p) return false;
  if (ts.isBinaryExpression(p) && EQUALITY_OPS.has(p.operatorToken.kind)) return true;
  if (ts.isCaseClause(p) && p.expression === cur) return true;
  if (isMatchCall(p) && p.arguments.includes(cur as ts.Expression)) return true;
  if (ts.isArrayLiteralExpression(p)) {
    let arr: ts.Node = p;
    while (ts.isParenthesizedExpression(arr.parent) || ts.isAsExpression(arr.parent)) arr = arr.parent;
    const access = arr.parent;
    return !!access && ts.isPropertyAccessExpression(access) && access.expression === arr && isMatchCall(access.parent);
  }
  return false;
}

/**
 * True when the node sits inside a position that is never copy (imports, types, console/logger/z/sql, throw,
 * `new Error`, comparisons).
 */
export function inDroppedContext(node: ts.Node, opts: { allowThrow?: boolean } = {}): boolean {
  if (isComparedLiteral(node)) return true;
  let propChecked = false;
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) || ts.isJsxFragment(p) || ts.isJsxSelfClosingElement(p)) propChecked = true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isTypeNode(p)) return true;
    if (ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true;
    if (ts.isThrowStatement(p) && !opts.allowThrow) return true;
    if (ts.isCallExpression(p) && isLoggerCall(p)) return true;
    if (ts.isNewExpression(p) && ts.isIdentifier(p.expression) && ERROR_CTORS.has(p.expression.text)) return true;
    // `style={{ fontFamily: 'Inter' }}`: a dropped JSX attribute drops everything inside its value.
    if (ts.isJsxAttribute(p) && isDroppedName(p.name.getText())) return true;
    if (ts.isTaggedTemplateExpression(p) && /^sql\b/.test(p.tag.getText())) return true;
    // Only the nearest enclosing property decides: `{ meta: { title: 'Real copy' } }` keeps the title.
    if (ts.isPropertyAssignment(p) && !propChecked) {
      propChecked = true;
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
    out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, scope: pathJoin(path), pos: node.getStart(sf) });
  };

  /** A variable initializer or returned value: keeps literals reached through ?:, ??, ||, && and wrappers. */
  const direct = (node: ts.Expression, inValue: boolean): void => {
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
      direct(node.expression, inValue);
    } else if (ts.isConditionalExpression(node)) {
      visit(node.condition, inValue);
      direct(node.whenTrue, inValue);
      direct(node.whenFalse, inValue);
    } else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind)) {
      direct(node.left, inValue);
      direct(node.right, inValue);
    } else {
      const text = literalText(node);
      if (text === undefined) visit(node, inValue);
      else {
        emit(node, text);
        if (ts.isTemplateExpression(node)) node.templateSpans.forEach((s) => visit(s.expression, inValue));
      }
    }
  };

  const visit = (node: ts.Node, inValue: boolean): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer) {
        path.push(ts.isIdentifier(node.name) ? node.name.text : '…');
        direct(node.initializer, inValue);
        path.pop();
      }
      return;
    }
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
      path.push(node.name && ts.isIdentifier(node.name) ? node.name.text : '…');
      ts.forEachChild(node, (c) => visit(c, inValue));
      path.pop();
      return;
    }
    if (ts.isReturnStatement(node)) {
      if (node.expression) direct(node.expression, inValue);
      return;
    }
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
      direct(node.body, inValue);
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

export interface PropertyScanOptions {
  /** Callee / constructor names whose string arguments are kept even when thrown (`ToolError`, `refuse`). */
  calls?: ReadonlySet<string>;
  /** Variable names whose string initializers are kept (`/_MESSAGE$/`). */
  constants?: RegExp;
}

/** `new ToolError('internal', msg)` without `{ userFacing: true }`: an operator/config message, never shown as copy. */
function isInternalToolError(node: ts.Node): boolean {
  if (!ts.isNewExpression(node) || calleeName(node) !== 'ToolError') return false;
  const [code, , options] = node.arguments ?? [];
  if (!code || !ts.isStringLiteral(code) || code.text !== 'internal') return false;
  const userFacing = options && ts.isObjectLiteralExpression(options) && options.properties.some((p) =>
    ts.isPropertyAssignment(p) && propName(p.name) === 'userFacing' && p.initializer.kind === ts.SyntaxKind.TrueKeyword);
  return !userFacing;
}

function calleeName(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return undefined;
  return ts.isIdentifier(node.expression) ? node.expression.text : undefined;
}

/**
 * Property mode: string values of properties named in `names` (also through conditionals / calls inside the value),
 * plus (Ruling R3) the string arguments of `opts.calls` and the initializers of `opts.constants` variables.
 */
export function collectPropertyLiterals(sf: ts.SourceFile, names: ReadonlySet<string>, opts: PropertyScanOptions = {}): RawLiteral[] {
  const out: RawLiteral[] = [];
  const path: string[] = [];
  const keep = (e: ts.Expression, allowThrow: boolean) => {
    for (const b of branchLiterals(e)) {
      if (inDroppedContext(b, { allowThrow })) continue;
      out.push({ text: literalText(b)!, line: sf.getLineAndCharacterOfPosition(b.getStart(sf)).line + 1, scope: pathJoin(path), pos: b.getStart(sf) });
    }
  };
  const visit = (node: ts.Node, capture: boolean): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isVariableDeclaration(node)) {
      const name = ts.isIdentifier(node.name) ? node.name.text : '…';
      path.push(name);
      if (node.initializer && opts.constants?.test(name)) keep(node.initializer, false);
      if (node.initializer) visit(node.initializer, false);
      path.pop();
      return;
    }
    const callee = calleeName(node);
    if (callee !== undefined && opts.calls?.has(callee) && !isInternalToolError(node)) {
      for (const a of (node as ts.CallExpression | ts.NewExpression).arguments ?? []) keep(a, true);
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
        out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, scope: pathJoin(path), pos: node.getStart(sf) });
      }
      return;
    }
    // A nested object literal under a captured property is not itself a value of that property.
    ts.forEachChild(node, (c) => visit(c, capture && !ts.isObjectLiteralExpression(node)));
  };
  visit(sf, false);
  return out;
}

/** Runs of unnamed placeholders (from `${a ? 'x' : ''}${b ? 'y' : ''}` or `{cond && …}` children) read as one. */
export function collapsePlaceholders(text: string): string {
  return text.replace(/(?:\{…\}){2,}/g, '{…}');
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', mdash: '—', ndash: '–', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', rarr: '→', larr: '←', times: '×', copy: '©',
};

/** JSX text and JSX attribute strings carry HTML entities (`can&apos;t`); show them as the browser does. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Filter with isCopyLike and assign stable anchors (`file#scope#n`, n = index among kept items of the same scope). */
export function toCopyItems(file: string, rule: Pick<SourceRule, 'surface'>, raws: RawLiteral[]): CopyItem[] {
  const counts = new Map<string, number>();
  const items: CopyItem[] = [];
  for (const raw of raws) {
    const r = { ...raw, text: collapsePlaceholders(raw.text) };
    if (!isCopyLike(r.text)) continue;
    const n = counts.get(r.scope) ?? 0;
    counts.set(r.scope, n + 1);
    items.push({
      surface: rule.surface,
      file,
      line: r.line,
      anchor: `${file}#${r.scope}#${n}`,
      context: r.context ?? r.scope,
      text: r.text,
      hash: hashText(r.text),
      kind: 'string',
    });
  }
  return items;
}

function branchLiterals(e: ts.Expression, out: ts.Expression[] = []): ts.Expression[] {
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) return branchLiterals(e.expression, out);
  if (ts.isConditionalExpression(e)) {
    branchLiterals(e.whenTrue, out);
    branchLiterals(e.whenFalse, out);
  } else if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(e.operatorToken.kind)) {
    branchLiterals(e.left, out);
    branchLiterals(e.right, out);
  } else if (literalText(e) !== undefined) out.push(e);
  return out;
}

/** Nearest enclosing function / component (named function, or arrow/function assigned to a variable), else variable. */
function jsxScope(node: ts.Node): string {
  let variable: string | undefined;
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
      const init = p.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return p.name.text;
      variable ??= p.name.text;
    }
  }
  return variable ?? '(module)';
}

/** JSX mode: JsxText runs (joined across `{expr}`), string-literal expression children and allow-listed attributes. */
export function collectJsxLiterals(sf: ts.SourceFile): RawLiteral[] {
  const out: RawLiteral[] = [];
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const push = (n: ts.Node, text: string, context: string) => {
    if (inDroppedContext(n)) return;
    out.push({ text, line: lineOf(n), scope: jsxScope(n), pos: n.getStart(sf), context });
  };

  const children = (parent: ts.JsxElement | ts.JsxFragment) => {
    const tag = ts.isJsxElement(parent) ? `<${parent.openingElement.tagName.getText(sf)}>` : '<>';
    let text = '';
    let first: ts.Node | undefined;
    let hasWords = false;
    const flush = () => {
      if (first && hasWords) push(first, text.replace(/\s+/g, ' ').trim(), tag);
      text = '';
      first = undefined;
      hasWords = false;
    };
    for (const c of parent.children) {
      if (ts.isJsxText(c)) {
        if (c.containsOnlyTriviaWhiteSpaces) {
          if (!c.text.includes(String.fromCharCode(10))) text += ' ';
          continue;
        }
        first ??= c;
        hasWords = true;
        text += decodeEntities(c.text);
      } else if (ts.isJsxExpression(c)) {
        if (!c.expression) continue;
        const lit = literalText(c.expression);
        if (lit !== undefined) {
          first ??= c;
          hasWords ||= lit.trim() !== '';
          text += lit;
        } else {
          const branches = branchLiterals(c.expression);
          for (const b of branches) push(b, literalText(b)!, tag);
          if (branches.length) flush();
          else {
            first ??= c;
            text += `{${substitutionName(c.expression)}}`;
          }
        }
      } else flush();
    }
    flush();
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) children(node);
    else if (ts.isJsxAttribute(node) && node.initializer) {
      const attr = node.name.getText(sf);
      if (KEEP_JSX_ATTRS.has(attr)) {
        const el = node.parent.parent;
        const tag = ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el) ? el.tagName.getText(sf) : '?';
        const exprs = ts.isJsxExpression(node.initializer) ? (node.initializer.expression ? branchLiterals(node.initializer.expression) : []) : [node.initializer];
        for (const e of exprs) {
          const t = literalText(e);
          if (t !== undefined) push(e, ts.isStringLiteral(e) && e.parent === node ? decodeEntities(t) : t, `<${tag} ${attr}>`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function scanTsFile(file: string, source: string, rule: TsScanRule): CopyItem[] {
  const sf = parseTs(file, source);
  switch (rule.mode) {
    case 'module':
      return toCopyItems(file, rule, collectModuleLiterals(sf));
    case 'property': {
      const opts = { calls: new Set(rule.calls ?? []), constants: rule.constants ? new RegExp(rule.constants) : undefined };
      const seen = new Set<number>();
      const raws = collectPropertyLiterals(sf, new Set(rule.properties ?? []), opts)
        .filter((r) => !seen.has(r.pos) && seen.add(r.pos))
        .sort((a, b) => a.pos - b.pos);
      return toCopyItems(file, rule, raws);
    }
    case 'jsx': {
      const seen = new Set<number>();
      const raws = [...collectJsxLiterals(sf), ...collectModuleLiterals(sf)]
        .filter((r) => !seen.has(r.pos) && seen.add(r.pos))
        .sort((a, b) => a.pos - b.pos);
      return toCopyItems(file, rule, raws);
    }
    default:
      throw new Error(`scanTsFile: mode '${rule.mode}' not implemented`);
  }
}
