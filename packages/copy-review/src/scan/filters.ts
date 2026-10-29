/** Noise filters shared by the TS scanner modes (spec 3.3). */

/**
 * Property / attribute names whose values are never copy, in objects and JSX alike. `data-*` is handled by
 * `isDroppedName`. `name` / `type` are NOT here: as object properties they are display labels in this repo (plan
 * names, chart series, field labels; Ruling R8 / I2), so they are dropped only as JSX attributes (`NON_COPY_JSX_ATTRS`).
 */
export const DROP_ATTRS: ReadonlySet<string> = new Set([
  'className', 'class', 'style', 'href', 'src', 'id', 'key', 'variant', 'tone', 'size', 'icon', 'rel',
  // HTTP header values in route handlers (`headers: { 'cache-control': 'private, no-store' }`).
  'cache-control', 'Cache-Control', 'content-type', 'Content-Type', 'content-disposition', 'Content-Disposition',
]);

/**
 * JSX attributes whose values are never copy (Ruling R8 / I1: every other attribute with a copy-like literal is kept).
 * Form-field names and input types, HTML/ARIA plumbing and SVG geometry. Only the attribute's own literal is dropped;
 * object values inside (`step={{ label: '…' }}`) are still read in module style unless the name is in `DROP_ATTRS`.
 */
export const NON_COPY_JSX_ATTRS: ReadonlySet<string> = new Set([
  'name', 'type', 'htmlFor', 'role', 'method', 'target', 'autoComplete', 'inputMode', 'pattern', 'enterKeyHint',
  'autoCapitalize', 'spellCheck', 'lang', 'dir', 'accept', 'encType', 'formAction', 'formMethod', 'formEncType',
  'formTarget', 'min', 'max', 'width', 'height', 'sizes', 'srcSet', 'loading', 'decoding', 'crossOrigin',
  'referrerPolicy', 'sandbox', 'allow', 'as', 'align', 'headers', 'wrap', 'dateTime', 'charSet', 'httpEquiv',
  'fontFamily', 'fontSize', 'fontWeight', 'd', 'viewBox', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap',
  'strokeLinejoin', 'strokeDasharray', 'fillRule', 'clipRule', 'clipPath', 'transform', 'xmlns', 'points', 'textAnchor',
  'dominantBaseline', 'preserveAspectRatio', 'stopColor', 'gradientUnits', 'markerEnd',
]);

/** The only `aria-*` attributes that carry text a person reads or hears. */
const ARIA_TEXT_ATTRS: ReadonlySet<string> = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'aria-placeholder']);

export function isDroppedName(name: string): boolean {
  return DROP_ATTRS.has(name) || name.startsWith('data-');
}

/** A JSX attribute whose value is never copy: `isDroppedName`, the deny-list, or a non-text `aria-*`. */
export function isNonCopyJsxAttr(name: string): boolean {
  return isDroppedName(name) || NON_COPY_JSX_ATTRS.has(name) || (name.startsWith('aria-') && !ARIA_TEXT_ATTRS.has(name));
}

const URL_RE = /^(?:[a-z][a-z0-9+.-]*:)?\/\/\S*$|^(?:mailto|tel|https?):\S*$/i;
const PATH_RE = /^(?:\.{0,2}\/|~\/)\S*$|^\S+\.(?:[a-z0-9]{1,5})$/;
const ENV_RE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;
const IDENT_RE = /^[a-z0-9]+(?:[_-][a-z0-9]+)+$/;
/** A CSS media query (`matchMedia('(min-width: 1024px)')`). */
const MEDIA_RE = /^\((?:min|max)-(?:width|height):\s*[\d.]+(?:px|em|rem)\)$/;
/** `document.cookie` attribute strings (`path=/; max-age=…`, `; Secure`). */
const COOKIE_RE = /^;?\s*(?:secure|httponly)$|(?:^|;\s*)(?:path|max-age|samesite|expires|domain)=/i;

/** Hyphen-less Tailwind utilities that appear next to hyphenated ones. */
const BARE_UTILITIES = new Set(['flex', 'grid', 'block', 'hidden', 'border', 'rounded', 'shadow', 'relative', 'absolute', 'fixed', 'sticky', 'truncate', 'italic', 'underline', 'uppercase', 'transition', 'container', 'inline', 'static']);

/** A `{name}` placeholder left by a template-literal substitution or a JSX expression, or a `%s` format slot. */
const PLACEHOLDER_RE = /\{[^{}]*\}|%[sd]/g;

/** Every whitespace-separated token (placeholders aside) looks like a CSS class / utility (contains one of `-:[]/`). */
function isCssLike(text: string): boolean {
  const tokens = text.split(/\s+/).filter((t) => t && !/^\{[^{}]*\}$/.test(t));
  // A colon marks a utility only as a variant prefix (`hover:x`), never at the end of a word (`removed:`).
  const utility = (t: string) => /[-[\]/]|:./.test(t);
  return tokens.length > 0 && tokens.some(utility) && tokens.every((t) => BARE_UTILITIES.has(t) || (/^[a-z0-9[]/.test(t) && utility(t)));
}

/**
 * Lone ALL-CAPS tokens that are real UI copy in the repo (table heads, chips, labels: `OK`, `URL`, `MRR`, `WAU` on
 * platform pages, `AI`/`MCP`/`HVAC` on the site). Any other lone ALL-CAPS token (`UTC`, `POST`) is a code value.
 */
export const KEEP_CAPS: ReadonlySet<string> = new Set(['OK', 'URL', 'AI', 'MCP', 'MRR', 'WAU', 'HVAC']);

/** Keep only strings that read as copy: a letter plus (a space, or leading capital, or ending in `.?!:`). */
export function isCopyLike(text: string): boolean {
  const t = text.trim();
  if (!/\p{L}/u.test(t.replace(PLACEHOLDER_RE, ''))) return false;
  if (/^[A-Z][A-Z0-9]*$/.test(t) && !KEEP_CAPS.has(t)) return false;
  if (!(/\s/.test(t) || /^\p{Lu}/u.test(t) || /[.?!:]$/.test(t))) return false;
  if (URL_RE.test(t) || ENV_RE.test(t) || IDENT_RE.test(t) || MEDIA_RE.test(t) || COOKIE_RE.test(t)) return false;
  if (!/\s/.test(t) && PATH_RE.test(t)) return false;
  if (isCssLike(t)) return false;
  return true;
}
