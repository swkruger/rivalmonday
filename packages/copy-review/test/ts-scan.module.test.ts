import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isCopyLike } from '../src/scan/filters.js';
import { scanTsFile } from '../src/scan/ts-scan.js';

const moduleSrc = readFileSync(new URL('./fixtures/module.ts', import.meta.url), 'utf8');
const toolSrc = readFileSync(new URL('./fixtures/tool.ts', import.meta.url), 'utf8');
const rule = { surface: 'help', mode: 'module' } as const;
const scan = (src = moduleSrc) => scanTsFile('fx/module.ts', src, rule);
const texts = (src?: string) => scan(src).map((i) => i.text);

describe('scanTsFile module mode', () => {
  it('keeps nested copy values with dotted path context', () => {
    const items = scan();
    const body = items.find((i) => i.text.startsWith('How {client}'))!;
    expect(body.context).toBe('PAGE_COPY.client.home.tips.score.body');
    expect(body.surface).toBe('help');
    expect(body.kind).toBe('string');
    expect(body.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(items.find((i) => i.text === 'Your score')!.context).toBe('PAGE_COPY.client.home.tips.score.title');
    expect(items.find((i) => i.text === 'Second tip here.')!.context).toBe('PAGE_COPY.list[1]');
    expect(texts()).toContain('Waiting for owner');
  });

  it('drops object keys, className, href, tone, ids, urls, snake_case', () => {
    const t = texts();
    for (const bad of ['flex items-center gap-2', '/c/home', 'success', 'Some Visible Id', 'https://example.com/page',
      'DATABASE_URL', 'some_snake_case', 'some-kebab-case', 'common-questions', 'neutral', 'client', 'home']) {
      expect(t).not.toContain(bad);
    }
    expect(t).not.toContain('./not-copy-path');
  });

  it('drops strings inside throw new Error / console / logger', () => {
    const t = texts();
    expect(t).not.toContain('Debug message here.');
    expect(t).not.toContain('Logged message here.');
    expect(t).not.toContain('Negative count is not allowed.');
    expect(t).not.toContain('A kind of type.');
  });

  it('template literal substitution becomes {name}', () => {
    expect(texts()).toContain('Hello {name}, you have {count} items.');
  });

  it('anchor stable when an unrelated string is inserted earlier in the file', () => {
    const before = scan().find((i) => i.text === 'Second tip here.')!;
    const edited = moduleSrc.replace('  list: [', "  intro: 'A brand new line of copy.',\n  list: [");
    const after = scan(edited).find((i) => i.text === 'Second tip here.')!;
    expect(after.anchor).toBe(before.anchor);
    expect(after.line).toBe(before.line + 1);
    expect(before.anchor).toBe('fx/module.ts#PAGE_COPY.list[1]#0');
  });

  it('line is 1-based line of the literal', () => {
    const item = scan().find((i) => i.text === 'Your score')!;
    expect(moduleSrc.split('\n')[item.line - 1]).toContain("'Your score'");
  });
});

describe('scanTsFile property mode', () => {
  it('property mode keeps only description values', () => {
    const items = scanTsFile('fx/tool.ts', toolSrc, { surface: 'mcp-tools', mode: 'property', properties: ['description'] });
    expect(items.map((i) => i.text)).toEqual([
      'Returns the weekly overview for a client.',
      'A nested description value.',
    ]);
    expect(items[0]!.surface).toBe('mcp-tools');
    expect(items[0]!.context).toBe('tool.description');
  });
});

describe('isCopyLike', () => {
  it('applies the spec filter', () => {
    expect(isCopyLike('Label')).toBe(true);
    expect(isCopyLike('two words')).toBe(true);
    expect(isCopyLike('done.')).toBe(true);
    expect(isCopyLike('neutral')).toBe(false);
    expect(isCopyLike('123 456')).toBe(false);
  });
});
