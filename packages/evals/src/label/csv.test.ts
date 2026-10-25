import { LABEL_COLUMNS, parseCsv } from '@cs/engine';
import { describe, expect, it } from 'vitest';
import type { EvalCase } from '../case';
import { buildSynthetic } from '../build/synthetic';
import { exportCsv, importCsv } from './csv';

const now = new Date('2026-10-24T12:00:00.000Z');
const cases = (): EvalCase[] => {
  const [a, b] = buildSynthetic('changes', 2, 3);
  return [{ ...a!, labelBy: 'llm:anthropic/claude-sonnet-5' }, { ...b!, confirmedAt: '2026-10-20T00:00:00.000Z', labelBy: 'owner' }];
};

/** What the labeler hands back: same columns, `label` edited per row. */
const edit = (csv: string, fn: (row: Record<string, string>) => void) => {
  const [header, ...rows] = parseCsv(csv);
  const out = rows.map((r) => {
    const o = Object.fromEntries(header!.map((h, i) => [h, r[i] ?? '']));
    fn(o);
    return header!.map((h) => o[h]!);
  });
  const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `${[header!, ...out].map((r) => r.map(cell).join(',')).join('\n')}\n`;
};

describe('label CSV', () => {
  it('export → labeler-shaped CSV → import round trip', () => {
    const cs = cases();
    const csv = exportCsv(cs);
    const [header, ...rows] = parseCsv(csv);
    expect(header).toEqual([...LABEL_COLUMNS]);
    const keys = (cs[0]!.input as { questionKeys: string[] }).questionKeys;
    expect(rows).toHaveLength(keys.length); // only the unconfirmed case
    const label = cs[0]!.label as Record<string, string>;
    for (const r of rows) {
      const o = Object.fromEntries(header!.map((h, i) => [h, r[i]]));
      expect(o.sample_id).toBe(cs[0]!.id);
      expect(o.task).toBe('tag_decisions');
      expect(o.label).toBe(label[o.question_key!]);
      expect(o.final).toBe(label[o.question_key!]);
      expect(o.allowed!.split('|')).toContain(o.label);
    }
    const out = importCsv(cs, csv, 'owner', now);
    expect(out).toMatchObject({ changed: 0, confirmed: 1 });
    expect(out.cases[0]).toMatchObject({ label, labelBy: 'owner', confirmedAt: now.toISOString() });
    expect(out.cases[1]).toEqual(cs[1]);
  });

  it('import counts changed rows', () => {
    const cs = cases();
    const csv = edit(exportCsv(cs), (r) => {
      if (r.question_key === 'meaningful') r.label = r.label === 'true' ? 'no' : 'yes';
    });
    const out = importCsv(cs, csv, 'owner', now);
    expect(out).toMatchObject({ changed: 1, confirmed: 1 });
    const before = (cs[0]!.label as Record<string, string>).meaningful;
    expect((out.cases[0]!.label as Record<string, string>).meaningful).toBe(before === 'true' ? 'false' : 'true');
  });

  it('a duplicated CSV row counts once in changed', () => {
    const cs = cases();
    const csv = edit(exportCsv(cs), (r) => {
      if (r.question_key === 'meaningful') r.label = r.label === 'true' ? 'no' : 'yes';
    });
    const lines = csv.trimEnd().split('\n');
    const dup = lines.find((l, i) => i > 0 && l.includes(',meaningful,'))!;
    expect(dup).toBeDefined();
    const out = importCsv(cs, `${[...lines, dup].join('\n')}\n`, 'owner', now);
    expect(out).toMatchObject({ changed: 1, confirmed: 1 });
  });

  it('unknown sample id fails', () => {
    const cs = cases();
    const csv = edit(exportCsv(cs), (r) => {
      r.sample_id = 'changes-nope';
    });
    expect(() => importCsv(cs, csv, 'owner', now)).toThrow(/changes-nope/);
  });

  it('a value outside the allowed set fails', () => {
    const cs = cases();
    const csv = edit(exportCsv(cs), (r) => {
      if (r.question_key === 'change_type') r.label = 'weather';
    });
    expect(() => importCsv(cs, csv, 'owner', now)).toThrow(/weather/);
  });
});
