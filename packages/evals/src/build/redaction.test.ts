import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATA_DIR, type EvalCase, readCases, SUITES, type Suite } from '../case';
import { contactLeaks } from './common';
import { buildGolden } from './golden';
import { buildSynthetic } from './synthetic';

const jsonlSuites = (): Suite[] => {
  let files: string[] = [];
  try {
    files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }
  return files.map((f) => f.slice(0, -'.jsonl'.length)).filter((s): s is Suite => (SUITES as readonly string[]).includes(s));
};

describe('redaction scan', () => {
  it('no email or phone anywhere in data/', () => {
    for (const suite of jsonlSuites()) {
      expect(contactLeaks(readCases(suite)), join(DATA_DIR, `${suite}.jsonl`)).toEqual([]);
    }
  });

  it('the scan catches a planted phone and email (negative self-test)', () => {
    const planted: EvalCase = {
      id: 'changes-planted', suite: 'changes', source: 'synthetic', vertical: 'dental', blocking: false,
      input: { state: { after: 'Call (972) 555-0100 today', nested: [{ note: 'mail front@example.com' }] }, verticalIds: ['dental'], questionKeys: [] },
      label: null, labelBy: null, confirmedAt: null,
    };
    expect(contactLeaks([planted])).toEqual(['changes-planted.input.state.after', 'changes-planted.input.state.nested[0].note']);
  });

  it('a case id whose hex hash holds a phone-shaped digit run is not a leak; the same run in input still is', () => {
    const id = 'reviews-csdev-0f78ba5785855770';
    const c: EvalCase = {
      id, suite: 'reviews', source: 'cs_dev', vertical: 'dental', blocking: false,
      input: { state: { review: 'Great visit' }, verticalIds: ['dental'], questionKeys: [] }, label: null, labelBy: null, confirmedAt: null,
    };
    expect(contactLeaks([c])).toEqual([]);
    expect(contactLeaks([{ ...c, input: { state: { review: 'ref 5785855770' }, verticalIds: ['dental'], questionKeys: [] } }])).toEqual([`${id}.input.state.review`]);
  });

  it('golden and synthetic builders emit no contact details (the hvac fixture page carries a phone number)', () => {
    expect(contactLeaks(buildGolden())).toEqual([]);
    expect(contactLeaks([...buildSynthetic('changes', 40, 1), ...buildSynthetic('reviews', 40, 1)])).toEqual([]);
  });
});
