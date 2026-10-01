import { describe, expect, it } from 'vitest';
import { alignBlocks, shapeSimilarity } from './align';
import type { Block } from './extract';

const blocks = (...items: [key: string, text: string][]): Block[] =>
  items.map(([blockKey, text], ord) => ({ ord, blockKey, path: blockKey.split('#')[0]!, text }));
const kinds = (r: ReturnType<typeof alignBlocks>) => r.map((a) => `${a.kind}:${a.before?.text ?? '-'}→${a.after?.text ?? '-'}`);

describe('shapeSimilarity', () => {
  it('ignores the numbers themselves', () => {
    expect(shapeSimilarity('AC Tune-Up $89', 'AC Tune-Up $69')).toBe(1);
    expect(shapeSimilarity('Call us today', 'Visit our showroom')).toBe(0);
  });
});

describe('alignBlocks', () => {
  it('pairs identical pages as unchanged', () => {
    const b = blocks(['h1#0', 'Title'], ['p#0', 'Body']);
    expect(kinds(alignBlocks(b, b))).toEqual(['unchanged:Title→Title', 'unchanged:Body→Body']);
  });

  it('pairs a price edit at the same key as modified', () => {
    expect(kinds(alignBlocks(blocks(['a.card#0', 'AC Tune-Up $89']), blocks(['a.card#0', 'AC Tune-Up $69'])))).toEqual(['modified:AC Tune-Up $89→AC Tune-Up $69']);
  });

  it('detects an item inserted at the top of a list without marking the rest modified', () => {
    const before = blocks(['ul>li#0', 'Plano'], ['ul>li#1', 'Allen']);
    const after = blocks(['ul>li#0', 'Frisco'], ['ul>li#1', 'Plano'], ['ul>li#2', 'Allen']);
    expect(kinds(alignBlocks(before, after))).toEqual(['added:-→Frisco', 'unchanged:Plano→Plano', 'unchanged:Allen→Allen']);
  });

  it('reports a removed block', () => {
    expect(kinds(alignBlocks(blocks(['p#0', 'Keep'], ['p#1', 'Gone soon']), blocks(['p#0', 'Keep'])))).toEqual(['unchanged:Keep→Keep', 'removed:Gone soon→-']);
  });

  it('treats a moved block with the same text as unchanged', () => {
    expect(kinds(alignBlocks(blocks(['div.a>p#0', 'Same words']), blocks(['div.b>p#0', 'Same words'])))).toEqual(['unchanged:Same words→Same words']);
  });

  it('pairs a lightly reworded block that moved containers', () => {
    const r = alignBlocks(blocks(['div.a>p#0', 'Family owned since 1998 and proud of it']), blocks(['div.b>p#0', 'Family owned since 1998, and proud of it!']));
    expect(r.map((a) => a.kind)).toEqual(['modified']);
  });

  it('keeps unrelated replacements under different keys as added + removed', () => {
    expect(alignBlocks(blocks(['div.a>p#0', 'Winter furnace special']), blocks(['div.b>p#0', 'Meet our new technicians'])).map((a) => a.kind).sort()).toEqual(['added', 'removed']);
  });

  it('pairs duplicate texts one-to-one', () => {
    const b = blocks(['a.btn#0', 'Book now'], ['a.btn#1', 'Book now']);
    expect(alignBlocks(b, blocks(['a.btn#0', 'Book now'])).map((a) => a.kind)).toEqual(['unchanged', 'removed']);
  });
});
