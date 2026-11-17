import { AiPausedError, brandLeaks, NEUTRAL_AGENCY_NAME, ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './prompt';
import { ASK_COPY } from './quota';
import { GENERIC_STARTERS } from './starters';
import { ASK_GUARD_QUESTIONS, askPausedCopy, DEFAULT_ASSISTANT_NAME } from './turn';

/** 13a2 Task 11: Ask for an unbranded agency ("Cool Agency": no display name, no assistant name) never names the platform. Friday is the mascot (Q9). */
describe('Ask leak sweep', () => {
  it.each(['Cool Agency', NEUTRAL_AGENCY_NAME])('the system prompt is clean for the product name %s', (productName) => {
    expect(brandLeaks(buildSystemPrompt({ assistantName: DEFAULT_ASSISTANT_NAME, productName }))).toEqual([]);
  });

  it('starters (the generic set) are clean', () => {
    for (const q of GENERIC_STARTERS) expect(brandLeaks(q), q).toEqual([]);
  });

  it('guard, paused, busy, quota and error templates are clean', () => {
    const texts = [
      ...Object.values(ASK_COPY).flatMap((v) => (typeof v === 'string' ? [v] : [])),
      ASK_COPY.error(DEFAULT_ASSISTANT_NAME),
      askPausedCopy(new AiPausedError('client')) ?? '',
      askPausedCopy(new AiPausedError('platform')) ?? '',
      askPausedCopy(new ToolError('spend_paused', 'S1', { userFacing: true })) ?? '',
      JSON.stringify(ASK_GUARD_QUESTIONS),
    ];
    expect(texts.every((t) => t.length > 0)).toBe(true);
    for (const t of texts) expect(brandLeaks(t), t).toEqual([]);
  });
});
