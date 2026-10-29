/** Noise filters shared by the TS scanner modes (spec 3.3). */

/** Property / attribute names whose values are never copy. `data-*` is handled by `isDroppedName`. */
export const DROP_ATTRS: ReadonlySet<string> = new Set([
  'className', 'class', 'style', 'href', 'src', 'id', 'key', 'name', 'type', 'variant', 'tone', 'size', 'icon',
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

/** Every whitespace-separated token looks like a CSS class / utility (contains one of `-:[]/`). */
function isCssLike(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => /^[a-z0-9]/.test(t) && /[-:[\]/]/.test(t));
}

/** Keep only strings that read as copy: a letter plus (a space, or leading capital, or ending in `.?!:`). */
export function isCopyLike(text: string): boolean {
  const t = text.trim();
  if (!/\p{L}/u.test(t)) return false;
  if (!(/\s/.test(t) || /^\p{Lu}/u.test(t) || /[.?!:]$/.test(t))) return false;
  if (URL_RE.test(t) || ENV_RE.test(t) || IDENT_RE.test(t)) return false;
  if (!/\s/.test(t) && PATH_RE.test(t)) return false;
  if (isCssLike(t)) return false;
  return true;
}
