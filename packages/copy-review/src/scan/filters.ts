/** Noise filters shared by the TS scanner modes (spec 3.3). */

/** Property / attribute names whose values are never copy. `data-*` is handled by `isDroppedName`. */
export const DROP_ATTRS: ReadonlySet<string> = new Set([
  'className', 'class', 'style', 'href', 'src', 'id', 'key', 'name', 'type', 'variant', 'tone', 'size', 'icon', 'rel',
]);

/** JSX attributes whose string values are copy. */
export const KEEP_JSX_ATTRS: ReadonlySet<string> = new Set([
  'title', 'label', 'placeholder', 'aria-label', 'alt', 'description', 'message', 'helper', 'hint', 'emptyText',
  'actionLabel', 'confirmLabel', 'cancelLabel',
]);

export function isDroppedName(name: string): boolean {
  return DROP_ATTRS.has(name) || name.startsWith('data-');
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
