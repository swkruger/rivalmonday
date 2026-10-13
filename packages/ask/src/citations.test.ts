import { describe, expect, it } from 'vitest';
import { CITATION_PREFIXES, parseCitations } from './citations';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const allowed = new Set([`ev:${A}`, `ev:${B}`]);

describe('parseCitations', () => {
  it('splits sentences but not decimals or prices', () => {
    const r = parseCitations(`They charge $4.99 per visit [ev:${A}]. Rated 4.5 stars! Really?`, CITATION_PREFIXES, allowed);
    expect(r.sentences.map((s) => s.text)).toEqual(['They charge $4.99 per visit.', 'Rated 4.5 stars!', 'Really?']);
    expect(r.sentences[0]!.refs).toEqual([`ev:${A}`]);
  });
  it('unknown ids dropped', () => {
    const bad = '33333333-3333-3333-3333-333333333333';
    const r = parseCitations(`Fact [ev:${A}][ev:${bad}].`, CITATION_PREFIXES, allowed);
    expect(r.sentences[0]!.refs).toEqual([`ev:${A}`]);
    expect(r.sentences[0]!.text).not.toContain('ev:');
  });
  it('bullets preserved', () => {
    const r = parseCitations(`Intro.\n- one [ev:${A}]\n- two`, CITATION_PREFIXES, allowed);
    expect(r.sentences.map((s) => s.text)).toEqual(['Intro.', '- one', '- two']);
  });
  it('accepts kb: citations', () => {
    const r = parseCitations(`Claim [kb:${A}].`, CITATION_PREFIXES, new Set([`kb:${A}`]));
    expect(r.sentences[0]!.refs).toEqual([`kb:${A}`]);
  });
  it('prefix list honoured (kb ignored when only ev allowed)', () => {
    const r = parseCitations(`Claim [kb:${A}] [ev:${B}].`, ['ev'], allowed);
    expect(r.sentences[0]!.refs).toEqual([`ev:${B}`]);
    expect(r.sentences[0]!.text).toContain(`[kb:${A}]`);
  });
});
