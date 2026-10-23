import { AiPausedError, ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { ASK_COPY } from './quota';
import { askPausedCopy } from './turn';

describe('askPausedCopy (one mapping for runTurn and the web fallback)', () => {
  it('maps model-call pauses and user-facing tool refusals to C4/C5, never S1', () => {
    expect(askPausedCopy(new AiPausedError('client'))).toBe(ASK_COPY.paused);
    expect(askPausedCopy(new AiPausedError('platform'))).toBe(ASK_COPY.busy);
    expect(askPausedCopy(new ToolError('spend_paused', 'S1', { userFacing: true }))).toBe(ASK_COPY.paused);
    expect(askPausedCopy(new ToolError('system_busy', 'busy', { userFacing: true }))).toBe(ASK_COPY.busy);
  });
  it('ignores everything else', () => {
    expect(askPausedCopy(new ToolError('spend_paused', 'x'))).toBeNull();
    expect(askPausedCopy(new ToolError('not_found', 'x', { userFacing: true }))).toBeNull();
    expect(askPausedCopy(new Error('x'))).toBeNull();
  });
});
