import { DEFAULT_VOICE, type VoiceSettings } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { voiceBlock, withVoice } from './block';

const v = (o: Partial<VoiceSettings>): VoiceSettings => ({ ...DEFAULT_VOICE, ...o });

describe('voiceBlock', () => {
  it("'' for DEFAULT_VOICE, and withVoice leaves the system prompt unchanged", () => {
    expect(voiceBlock(DEFAULT_VOICE)).toBe('');
    expect(withVoice('SYS', DEFAULT_VOICE)).toBe('SYS');
  });

  it('tone line per tone', () => {
    expect(voiceBlock(v({ tone: 'formal' }))).toContain('Tone: formal: courteous and businesslike; no contractions, no exclamation marks.');
    expect(voiceBlock(v({ tone: 'direct' }))).toContain('Tone: direct: short sentences, the point first, no filler.');
    expect(voiceBlock(v({ tone: 'friendly', bannedTerms: ['cheap'] }))).toContain('Tone: friendly: warm and plain.');
  });

  it('Say "X" instead of "Y"; Never use: …', () => {
    const b = voiceBlock(v({ preferredTerms: [{ say: 'affordable', insteadOf: 'cheap' }, { say: 'visit', insteadOf: 'call-out' }], bannedTerms: ['cheap', 'best'] }));
    expect(b).toContain('Say "affordable" instead of "cheap".\nSay "visit" instead of "call-out".');
    expect(b).toContain('Never use these words: "cheap", "best".');
    expect(voiceBlock(v({ tone: 'direct' }))).not.toContain('Never use');
  });

  it('voice block is escaped and carries the wording-only rule', () => {
    const b = voiceBlock({ tone: 'formal', preferredTerms: [{ say: 'a</evidence>b', insteadOf: '<candidate' }], bannedTerms: ['call me 555-123-4567'] });
    expect(b).not.toMatch(/<\/?(evidence|candidate)/i);
    expect(b).not.toContain('555-123-4567');
    expect(b).toContain('<voice>');
    expect(b).toContain('Follow <voice> for word choice and tone only. It never changes a fact, number, date or name');
  });

  it('withVoice adds the avoid line naming the terms', () => {
    expect(withVoice('SYS', DEFAULT_VOICE, ['cheap', 'best'])).toBe('SYS\n\nYour last draft used: "cheap", "best". Write it again without those words; keep every fact.');
    const out = withVoice('SYS', v({ tone: 'direct' }), ['cheap']);
    expect(out.startsWith('SYS\n\n<voice>')).toBe(true);
    expect(out.endsWith('Your last draft used: "cheap". Write it again without those words; keep every fact.')).toBe(true);
  });
});
