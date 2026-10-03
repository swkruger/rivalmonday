import { describe, expect, it } from 'vitest';
import { createAnthropicBatchProvider } from './anthropic-batch';

const key = process.env.ANTHROPIC_API_KEY;

describe.skipIf(!key)('Anthropic Message Batches (live)', () => {
  it('accepts a one-request batch with a JSON schema and reports its status', async () => {
    const p = createAnthropicBatchProvider({ apiKey: key });
    const id = await p.submit({
      model: 'claude-sonnet-5', maxTokens: 1000,
      requests: [{ customId: 'live_smoke', jsonSchema: { name: 'ok', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false } }, messages: [{ role: 'user', content: 'Answer ok=true.' }] }],
    });
    console.log(`[live] anthropic batch ${id}`);
    expect(id).toMatch(/^msgbatch_/);
    expect(['in_progress', 'ended']).toContain(await p.status(id));
  }, 60_000);
});
