import * as cheerio from 'cheerio';

export const EXTRACTOR_VERSION = 1;
export const MAX_BLOCKS = 400;
export const MAX_BLOCK_CHARS = 2000;

export interface Block {
  ord: number;
  path: string;
  blockKey: string;
  text: string;
}

const NOISE = [
  'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'canvas', 'object', 'nav', 'footer',
  '[role="navigation"]', '[role="contentinfo"]', '[aria-hidden="true"]', '[hidden]',
].join(',');
const CONSENT = /cookie|consent|gdpr|ccpa|onetrust|cookiebot|truste|cc-window|cmp-/i;
const BLOCK_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'dt', 'dd', 'blockquote', 'figcaption', 'caption', 'summary', 'label', 'button', 'a']);
const INLINE_TAGS = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 'small', 'sup', 'sub', 'mark', 'br', 'abbr', 'time', 's', 'del', 'ins', 'img', 'picture', 'source', 'code', 'q', 'cite', 'font']);
/** Hand-written class/id names only: generated ones (css-1x2y3z, sc-AbC12) carry digits and change between deploys. */
const STABLE_NAME = /^[a-z][a-z_-]{1,24}$/i;

/** Minimal view of the domhandler nodes cheerio produces (avoids a direct domhandler dependency). */
interface DomNode {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

const isTag = (n: DomNode): n is DomNode & { name: string } => (n.type === 'tag' || n.type === 'script' || n.type === 'style') && typeof n.name === 'string';
const tagName = (n: DomNode) => (n.name ?? '').toLowerCase();

function segment(el: DomNode): string {
  const id = el.attribs?.id;
  const classes = (el.attribs?.class ?? '').split(/\s+/).filter((c) => STABLE_NAME.test(c)).sort().slice(0, 2);
  return `${tagName(el)}${id && STABLE_NAME.test(id) ? `#${id}` : ''}${classes.map((c) => `.${c}`).join('')}`;
}

/** Text of a node: inline elements concatenate as-is, other elements are space-separated, <br> breaks. */
function textOf(node: DomNode): string {
  if (node.type === 'text') return node.data ?? '';
  if (!isTag(node)) return '';
  const name = tagName(node);
  if (name === 'br') return ' ';
  const inner = (node.children ?? []).map(textOf).join('');
  return INLINE_TAGS.has(name) ? inner : ` ${inner} `;
}

const hasNonInlineChild = (el: DomNode) => (el.children ?? []).some((c) => isTag(c) && !INLINE_TAGS.has(tagName(c)));
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

export function extractBlocks(html: string): Block[] {
  const $ = cheerio.load(html);
  $(NOISE).remove();
  $('[id],[class]').each((_, el) => {
    const $el = $(el);
    if (CONSENT.test($el.attr('id') ?? '') || CONSENT.test($el.attr('class') ?? '')) $el.remove();
  });

  const blocks: Block[] = [];
  const seen = new Map<string, number>();
  const push = (path: string, raw: string) => {
    if (blocks.length >= MAX_BLOCKS) return;
    const text = normalize(raw).slice(0, MAX_BLOCK_CHARS);
    if (!/[\p{L}\p{N}]/u.test(text)) return;
    const n = seen.get(path) ?? 0;
    seen.set(path, n + 1);
    blocks.push({ ord: blocks.length, path, blockKey: `${path}#${n}`, text });
  };

  const visit = (node: DomNode, nodePath: string[]) => {
    let run = '';
    const flush = () => {
      if (normalize(run)) push(nodePath.join('>') || 'body', run);
      run = '';
    };
    for (const child of node.children ?? []) {
      if (child.type === 'text') {
        run += child.data ?? '';
        continue;
      }
      if (!isTag(child)) continue;
      const name = tagName(child);
      if (INLINE_TAGS.has(name) && !hasNonInlineChild(child)) {
        run += textOf(child);
        continue;
      }
      flush();
      const childPath = [...nodePath, segment(child)];
      if (BLOCK_TAGS.has(name) || !hasNonInlineChild(child)) push(childPath.join('>'), textOf(child));
      else visit(child, childPath);
    }
    flush();
  };

  const body = ($('body')[0] ?? $.root()[0]) as unknown as DomNode;
  visit(body, []);
  return blocks;
}
