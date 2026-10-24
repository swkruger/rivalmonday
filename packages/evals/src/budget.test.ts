import type { Ai } from '@cs/ai';
import { describe, expect, it } from 'vitest';
import { BudgetExceededError, budgetedAi, createSpendMeter, NULL_COST_USD } from './budget';

const scope = { agencyId: null, clientId: null } as never;
const rec = (costUsd: number | null) => ({ task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs: 1, ok: true }) as never;

function fakeAi(costs: (number | null)[], meter: ReturnType<typeof createSpendMeter>) {
  let calls = 0;
  const ai = {
    chat: async () => { await meter.ledger.recordLlmCall(rec(costs[calls++] as number | null)); return { text: 'x' }; },
    batchAvailable: () => false,
  } as unknown as Ai;
  return { ai, calls: () => calls };
}

describe('budgetedAi', () => {
  it('stops before the next call once spent >= cap', async () => {
    const meter = createSpendMeter();
    const { ai, calls } = fakeAi([0.4, 0.7, 0.1], meter);
    const b = budgetedAi(ai, 1, meter);
    await b.chat('t', { messages: [] }, scope); // 0.4
    await b.chat('t', { messages: [] }, scope); // 1.1: overshoot of one call is allowed
    expect(b.spent()).toBeCloseTo(1.1);
    await expect(b.chat('t', { messages: [] }, scope)).rejects.toBeInstanceOf(BudgetExceededError);
    expect(calls()).toBe(2);
  });

  it('stops exactly at the cap', async () => {
    const meter = createSpendMeter();
    const { ai, calls } = fakeAi([1], meter);
    const b = budgetedAi(ai, 1, meter);
    await b.chat('t', { messages: [] }, scope);
    await expect(b.chat('t', { messages: [] }, scope)).rejects.toThrow(/Eval budget reached/);
    expect(calls()).toBe(1);
  });

  it('null cost counts $0.05', async () => {
    const meter = createSpendMeter();
    const { ai } = fakeAi([null, null], meter);
    const b = budgetedAi(ai, 10, meter);
    await b.chat('t', { messages: [] }, scope);
    await b.chat('t', { messages: [] }, scope);
    expect(NULL_COST_USD).toBe(0.05);
    expect(b.spent()).toBeCloseTo(0.1);
  });

  it('counts vendor calls too', async () => {
    const meter = createSpendMeter();
    await meter.ledger.recordVendorCall({ costUsd: null } as never);
    expect(meter.spent()).toBeCloseTo(0.05);
  });

  it('concurrent calls cannot all pass the gate: in-flight calls reserve $0.05 each', async () => {
    const meter = createSpendMeter();
    let started = 0;
    let release!: () => void;
    const gateOpen = new Promise<void>((r) => { release = r; });
    const ai = {
      chat: async () => { started++; await gateOpen; await meter.ledger.recordLlmCall(rec(0.05)); return { text: 'x' }; },
      batchAvailable: () => false,
    } as unknown as Ai;
    const b = budgetedAi(ai, 0.1, meter);
    const results = Promise.allSettled(Array.from({ length: 5 }, () => b.chat('t', { messages: [] }, scope)));
    await new Promise((r) => setTimeout(r, 10));
    release();
    const settled = await results;
    expect(started).toBe(2);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(2);
    expect(settled.filter((s) => s.status === 'rejected' && s.reason instanceof BudgetExceededError)).toHaveLength(3);
    expect(b.spent()).toBeCloseTo(0.1);
  });

  it('releases the reservation when a call fails', async () => {
    const meter = createSpendMeter();
    const ai = { chat: async () => { throw new Error('boom'); }, batchAvailable: () => false } as unknown as Ai;
    const b = budgetedAi(ai, 0.1, meter);
    for (let i = 0; i < 5; i++) await expect(b.chat('t', { messages: [] }, scope)).rejects.toThrow('boom');
  });
});
