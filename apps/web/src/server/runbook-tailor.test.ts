import { AiPausedError } from '@cs/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { tailorOrNull } = await import('./runbook-tailor');

describe('tailorOrNull (7b1)', () => {
  it('returns the proposal, and null for an ordinary failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await tailorOrNull('k', 'c1', async () => ({ ok: 1 }))).toEqual({ ok: 1 });
    expect(await tailorOrNull('k', 'c1', async () => { throw new Error('down'); })).toBeNull();
  });
  it('rethrows AiPausedError so the registry maps it to the S1/C5 ToolError', async () => {
    for (const reason of ['platform', 'client'] as const) {
      await expect(tailorOrNull('k', 'c1', async () => { throw new AiPausedError(reason); })).rejects.toBeInstanceOf(AiPausedError);
    }
  });
});
