import ts from 'typescript';
import { hashText } from '../text.js';
import type { CopyItem, SourceRule } from '../types.js';
import { isCopyLike, isDroppedName, isNonCopyJsxAttr } from './filters.js';

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

/** Call roots whose string arguments are never copy (`console.x`, `logger.x`, `log.x`). `z.` chains: see `schemaMessageCall`. */
const DROP_CALL_ROOTS: ReadonlySet<string> = new Set(['console', 'logger', 'log']);
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

/**
 * Schema methods whose string arguments are error messages or descriptions (`.min(1, 'msg')`, `.email('msg')`,
 * `.refine(fn, 'msg')`, `.describe('…')`, `z.string('msg')`). Any other string inside a `z.` chain (enum / literal /
 * default values, keys, refine bodies) is never copy (Ruling R8 / I3a).
 */
const SCHEMA_MESSAGE_METHODS: ReadonlySet<string> = new Set([
  'min', 'max', 'length', 'nonempty', 'email', 'url', 'uuid', 'regex', 'refine', 'superRefine', 'check', 'int', 'positive',
  'negative', 'nonnegative', 'nonpositive', 'gt', 'gte', 'lt', 'lte', 'multipleOf', 'finite', 'safe', 'datetime', 'date',
  'time', 'ip', 'ipv4', 'ipv6', 'cuid', 'cuid2', 'ulid', 'emoji', 'e164', 'describe', 'string', 'number', 'boolean',
]);
/** Object-argument properties of a schema call that hold its error message (`{ message }`, zod 4 `{ error }`). */
const SCHEMA_MESSAGE_PROPS: ReadonlySet<string> = new Set(['message', 'error', 'required_error', 'invalid_type_error', 'description']);
/** Calls that carry schema messages whatever their root: `IsoDate.refine(fn, 'msg')`, `ctx.addIssue({ message })`. */
const ANY_ROOT_SCHEMA_METHODS: ReadonlySet<string> = new Set(['refine', 'superRefine', 'addIssue']);

function methodName(call: ts.CallExpression): string | undefined {
  const e = call.expression;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return ts.isIdentifier(e) ? e.text : undefined;
}

const isZodCall = (n: ts.Node): n is ts.CallExpression => ts.isCallExpression(n) && rootIdent(n.expression) === 'z';
const isSchemaCall = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) && (isZodCall(n) || ANY_ROOT_SCHEMA_METHODS.has(methodName(n) ?? ''));

/** Climb through wrappers that keep a literal "the value" (parens, `as`, `?:` branches, `??` / `||` / `&&`). */
function valueTop(node: ts.Node): ts.Node {
  let cur = node;
  for (;;) {
    const p = cur.parent;
    if (!p) return cur;
    if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p) || ts.isSatisfiesExpression(p)) cur = p;
    else if (ts.isConditionalExpression(p) && p.condition !== cur) cur = p;
    else if (ts.isBinaryExpression(p) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(p.operatorToken.kind)) cur = p;
    else return cur;
  }
}

/** The schema call whose error message / description this literal is, else undefined. */
function schemaMessageCall(node: ts.Node): ts.CallExpression | undefined {
  let cur = valueTop(node);
  let p = cur.parent;
  if (p && ts.isPropertyAssignment(p) && p.initializer === cur) {
    if (!SCHEMA_MESSAGE_PROPS.has(propName(p.name) ?? '') || !ts.isObjectLiteralExpression(p.parent)) return undefined;
    cur = p.parent;
    p = cur.parent;
    return p && isSchemaCall(p) && p.arguments.includes(cur as ts.Expression) ? p : undefined;
  }
  if (p && isSchemaCall(p) && p.arguments.includes(cur as ts.Expression) && SCHEMA_MESSAGE_METHODS.has(methodName(p) ?? '')) return p;
  return undefined;
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
  const schemaMessage = schemaMessageCall(node) !== undefined;
  let propChecked = false;
  for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) || ts.isJsxFragment(p) || ts.isJsxSelfClosingElement(p)) propChecked = true;
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isTypeNode(p)) return true;
    if (ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true;
    if (ts.isThrowStatement(p) && !opts.allowThrow) return true;
    if (ts.isCallExpression(p) && isLoggerCall(p)) return true;
    if (!schemaMessage && isZodCall(p)) return true;
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

/**
 * Calls whose string arguments are user-facing messages, returned or thrown (Ruling R8 / I3b): server-action result
 * helpers (`done(…)`, `fail(…)`, `failProspectReport(…)`), refusal helpers (`refuse`, `refused`, `new ToolError`), local
 * `push(…)` finding builders and
 * React state setters (`setError`, `setNotice`, `setUploadError`; plain identifiers only, so `res.setHeader` is not one).
 */
const MESSAGE_CALLEE_RE = /^(?:done|fail\w*|refuse|refused|ToolError|push|set[A-Z]\w*)$/;

function isMessageCall(node: ts.Node, extra?: ReadonlySet<string>): node is ts.CallExpression | ts.NewExpression {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return false;
  const e = node.expression;
  if (ts.isIdentifier(e)) return (MESSAGE_CALLEE_RE.test(e.text) || !!extra?.has(e.text)) && !isInternalToolError(node);
  // `problems.push('Name is required')`, `facts.push(\`You rank …\`)`: lists of messages built up for display.
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(e) && e.name.text === 'push';
}

/** Literal nodes a call hands out as user-facing text: message-call arguments, or a schema call's messages. */
function messageLiterals(node: ts.Node, extra?: ReadonlySet<string>): ts.Expression[] {
  if (isMessageCall(node, extra)) return (node.arguments ?? []).flatMap((a) => branchLiterals(a));
  if (!isSchemaCall(node)) return [];
  const out: ts.Expression[] = [];
  for (const a of node.arguments) {
    if (!ts.isObjectLiteralExpression(a)) out.push(...branchLiterals(a));
    else {
      for (const pr of a.properties) {
        if (ts.isPropertyAssignment(pr) && SCHEMA_MESSAGE_PROPS.has(propName(pr.name) ?? '')) out.push(...branchLiterals(pr.initializer));
      }
    }
  }
  return out.filter((l) => schemaMessageCall(l) === node);
}

function pathJoin(path: string[]): string {
  return path.reduce((acc, seg) => (seg.startsWith('[') ? acc + seg : acc ? `${acc}.${seg}` : seg), '');
}

/**
 * Module mode: string / template literals that are a property-assignment value or array element (also when wrapped in
 * a call, conditional, `as`, etc. inside one), a variable initializer, returned value, default value or assignment
 * (R2, R8), or a message-call / schema-message argument (R8), anywhere in the file. Reused by the jsx mode for .tsx.
 */
export function collectModuleLiterals(sf: ts.SourceFile, opts: { calls?: ReadonlySet<string> } = {}): RawLiteral[] {
  const out: RawLiteral[] = [];
  const path: string[] = [];

  const emit = (node: ts.Node, text: string, allowThrow = false) => {
    if (inDroppedContext(node, { allowThrow })) return;
    out.push({ text, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, scope: pathJoin(path), pos: node.getStart(sf) });
  };

  /** A variable initializer or returned value: keeps literals reached through ?:, ??, ||, && and wrappers. */
  const direct = (node: ts.Expression, inValue: boolean): void => {
    const receiver = textKeepingReceiver(node);
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) {
      direct(node.expression, inValue);
    } else if (receiver) {
      direct(receiver, inValue);
      (node as ts.CallExpression).arguments.forEach((a) => visit(a, inValue));
    } else if (ts.isConditionalExpression(node)) {
      visit(node.condition, inValue);
      direct(node.whenTrue, inValue);
      direct(node.whenFalse, inValue);
    } else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind)) {
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
    // Messages handed to a result helper / setter / `.push` / schema, wherever the call sits (Ruling R8 / I3).
    for (const lit of messageLiterals(node, opts.calls)) emit(lit, literalText(lit)!, true);
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
    // Default values (`{ title = 'Save as recommendation' }`) and assignments (`e.name = 'Enter the business name.'`).
    if ((ts.isParameter(node) || ts.isBindingElement(node)) && node.initializer) {
      path.push(ts.isIdentifier(node.name) ? node.name.text : '…');
      direct(node.initializer, inValue);
      path.pop();
      return;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      visit(node.left, inValue);
      direct(node.right, inValue);
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

/** `\`Remove filter ${x}\`.trim()`, `.slice(0, MAX)`: the receiver literal is still the shown text. */
const TEXT_KEEPING_METHODS: ReadonlySet<string> = new Set(['trim', 'trimStart', 'trimEnd', 'slice']);

/** The receiver of a text-keeping method call (`'…'.trim()`), else undefined. */
function textKeepingReceiver(e: ts.Expression): ts.Expression | undefined {
  return ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && TEXT_KEEPING_METHODS.has(e.expression.name.text)
    ? e.expression.expression
    : undefined;
}

function branchLiterals(e: ts.Expression, out: ts.Expression[] = []): ts.Expression[] {
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) return branchLiterals(e.expression, out);
  const receiver = textKeepingReceiver(e);
  if (receiver) return branchLiterals(receiver, out);
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

/** JSX mode: JsxText runs (joined across `{expr}`), string-literal expression children and non-deny-listed attributes. */
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
      // Every attribute is copy unless deny-listed (Ruling R8 / I1); `on*` handler values are code.
      if (!isNonCopyJsxAttr(attr) && !/^on[A-Z]/.test(attr)) {
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
    case 'module': {
      const seen = new Set<number>();
      const raws = collectModuleLiterals(sf, { calls: new Set(rule.calls ?? []) })
        .filter((r) => !seen.has(r.pos) && seen.add(r.pos))
        .sort((a, b) => a.pos - b.pos);
      return toCopyItems(file, rule, raws);
    }
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
      const raws = [...collectJsxLiterals(sf), ...collectModuleLiterals(sf, { calls: new Set(rule.calls ?? []) })]
        .filter((r) => !seen.has(r.pos) && seen.add(r.pos))
        .sort((a, b) => a.pos - b.pos);
      return toCopyItems(file, rule, raws);
    }
    default:
      throw new Error(`scanTsFile: mode '${rule.mode}' not implemented`);
  }
}
