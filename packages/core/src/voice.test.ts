import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE, effectiveVoice, enforcedTerms, findBannedTerms, isDefaultVoice, VoiceSettingsSchema, type VoiceSettings } from './voice';

const v = (o: Partial<VoiceSettings> = {}): VoiceSettings => ({ ...DEFAULT_VOICE, ...o });
const ok = (o: Partial<VoiceSettings>) => VoiceSettingsSchema.safeParse(v(o)).success;

describe('term rules', () => {
  it('41 chars, "a*b", "<b>", "{x}", "a\nb", "" rejected; accepted set passes', () => {
    for (const bad of ['a'.repeat(41), 'a*b', '<b>', '{x}', 'a\nb', '']) {
      expect(ok({ bannedTerms: [bad] }), JSON.stringify(bad)).toBe(false);
    }
    for (const good of ["can't", 'Ünïcode', 'co-op', 'AC tune-up']) {
      expect(ok({ bannedTerms: [good] }), good).toBe(true);
    }
  });
  it('21 banned terms rejected', () => {
    expect(ok({ bannedTerms: Array.from({ length: 21 }, (_, i) => `t${i}`) })).toBe(false);
    expect(ok({ bannedTerms: Array.from({ length: 20 }, (_, i) => `t${i}`) })).toBe(true);
  });
  it('"cheap" both said and banned → refused', () => {
    expect(ok({ preferredTerms: [{ say: 'cheap', insteadOf: 'low-cost' }], bannedTerms: ['cheap'] })).toBe(false);
  });
  it('"Cheap" and "cheap" banned → refused', () => {
    expect(ok({ bannedTerms: ['Cheap', 'cheap'] })).toBe(false);
  });
});

describe('findBannedTerms', () => {
  it('is case-insensitive and whole-word ("cheap" not in "cheaply"/"cheaper")', () => {
    expect(findBannedTerms('So CHEAP today', ['cheap'])).toEqual(['cheap']);
    expect(findBannedTerms('cheaply made, cheaper still', ['cheap'])).toEqual([]);
  });
  it('multi-word and apostrophe terms; whitespace runs match', () => {
    expect(findBannedTerms('the ac   tune-up special', ['AC tune-up'])).toEqual(['AC tune-up']);
    expect(findBannedTerms("we can't wait", ["can't"])).toEqual(["can't"]);
  });
  it('Unicode letters are word characters ("café" not in "cafés")', () => {
    expect(findBannedTerms('two cafés', ['café'])).toEqual([]);
    expect(findBannedTerms('a café.', ['café'])).toEqual(['café']);
  });
  it('returns terms in list order', () => {
    expect(findBannedTerms('b then a', ['a', 'b'])).toEqual(['a', 'b']);
  });
});

it('enforcedTerms drops terms found in names', () => {
  expect(enforcedTerms(['cheap', 'best'], ['Cheap Heat Co', 'Acme'])).toEqual(['best']);
});
it('isDefaultVoice', () => {
  expect(isDefaultVoice(DEFAULT_VOICE)).toBe(true);
  expect(isDefaultVoice(v({ tone: 'formal' }))).toBe(false);
  expect(isDefaultVoice(v({ bannedTerms: ['x'] }))).toBe(false);
});
it('effectiveVoice: override wins whole; null → agency; both null → DEFAULT_VOICE', () => {
  const a = v({ tone: 'formal' });
  const o = v({ tone: 'direct' });
  expect(effectiveVoice(a, o)).toBe(o);
  expect(effectiveVoice(a, null)).toBe(a);
  expect(effectiveVoice(null, null)).toBe(DEFAULT_VOICE);
});
