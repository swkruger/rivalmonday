import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scanTsFile } from '../src/scan/ts-scan.js';

const src = readFileSync(new URL('./fixtures/page.tsx', import.meta.url), 'utf8');
const rule = { surface: 'app-client', mode: 'jsx' } as const;
const scan = (s = src) => scanTsFile('fx/page.tsx', s, rule);
const texts = () => scan().map((i) => i.text);

describe('scanTsFile jsx mode', () => {
  it('joins text around expressions into one item', () => {
    const t = texts();
    expect(t).toContain('You have {count} items in your queue.');
    expect(t).toContain('Hello');
    expect(t).toContain(', you have {count} new alerts waiting.');
    expect(t).toContain('Welcome back');
  });

  it('keeps aria-label/placeholder/title literals, drops className/href', () => {
    const t = texts();
    for (const keep of ['Search rivals', 'Type a rival name', 'Open the dashboard', 'Save changes']) expect(t).toContain(keep);
    for (const bad of ['flex items-center gap-2', 'w-full px-2', '/c/home', 'Some Field', 'welcome-card', 'primary']) expect(t).not.toContain(bad);
  });

  it('keeps string literal expression children and module-mode object literals', () => {
    const t = texts();
    expect(t).toContain('Alerts are on');
    expect(t).toContain('Literal child text');
    expect(t).toContain('Last seen');
    expect(t).toContain('Name');
  });

  it('context names the parent tag', () => {
    const items = scan();
    expect(items.find((i) => i.text === 'Welcome back')!.context).toBe('<h1>');
    expect(items.find((i) => i.text === 'Search rivals')!.context).toBe('<input aria-label>');
    expect(items.find((i) => i.text === 'Save changes')!.context).toBe('<Button label>');
  });

  it('anchor ordinal is per component, so a new string in another component changes nothing', () => {
    const before = scan().find((i) => i.text === 'Nothing to see here')!;
    const welcomeBefore = scan().find((i) => i.text === 'Welcome back')!;
    expect(before.anchor).toBe('fx/page.tsx#Other#0');
    const edited = src.replace('<div>Nothing', '<div><i>Brand new words</i>Nothing');
    const after = scan(edited);
    expect(after.find((i) => i.text === 'Welcome back')!.anchor).toBe(welcomeBefore.anchor);
    const editedWelcome = src.replace('<h1>Welcome back</h1>', '<h1>Welcome back</h1><h2>Another heading</h2>');
    expect(scan(editedWelcome).find((i) => i.text === 'Nothing to see here')!.anchor).toBe(before.anchor);
  });

  it('line is the 1-based line of the first piece', () => {
    const item = scan().find((i) => i.text === 'Welcome back')!;
    expect(src.split('\n')[item.line - 1]).toContain('Welcome back');
  });
});

describe('class strings', () => {
  it('drops class-name constants mixing bare and hyphenated utilities', () => {
    const items = scanTsFile('fx/c.tsx', "export const C = 'rounded-md border border-danger/30 p-3 text-sm';", { surface: 'app-shared', mode: 'jsx' });
    expect(items).toEqual([]);
  });
});

describe('DROP_ATTRS', () => {
  it('DROP_ATTRS applies to the nearest property only', () => {
    const items = scanTsFile('fx/a.ts', "export const X = { name: 'x', meta: { title: 'Real copy here' }, type: 'Primary button text', style: { label: 'Nested under dropped' } };", { surface: 'help', mode: 'module' });
    const t = items.map((i) => i.text);
    expect(t).toContain('Real copy here');
    // Ruling R8 / I2: `name` / `type` object values are display copy; only JSX `name` / `type` attributes are dropped.
    expect(t).toContain('Primary button text');
    expect(t).toContain('Nested under dropped');
  });
});
