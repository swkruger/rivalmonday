import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { llmCall } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { loadRehearsalLatency } from '@cs/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDemoTables } from '../test-support';
import { measureRehearsalLatency } from './latency';

const dbs = openTestDbs();
const dir = mkdtempSync(join(tmpdir(), 'rehearsal-latency-'));
afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await dbs.closeAll();
});
const NOW = new Date('2026-11-09T15:00:00Z');
const row = (task: string, provider: string, latencyMs: number, daysAgo = 1, ok = true) => ({
  task, provider, model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs, ok, createdAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
});

beforeAll(async () => {
  await resetDemoTables(dbs.owner);
  await dbs.owner.insert(llmCall).values([
    ...Array.from({ length: 10 }, (_, i) => row('brief_writer', 'openrouter', (i + 1) * 100)),
    ...Array.from({ length: 10 }, () => row('brief_writer', 'rehearsal', 99_999)), // simulated latencies: never measured
    row('brief_writer', 'openrouter', 50_000, 1, false), // failed calls are not a latency sample
    row('brief_writer', 'openrouter', 70_000, 40), // outside the window
    row('alert_writer', 'openrouter', 900), row('alert_writer', 'openrouter', 950), // too few samples: keep the old entry
  ]);
});

describe('measureRehearsalLatency', () => {
  it('writes measured p50/p90/p99 per task from non-rehearsal ledger rows, keeping tasks without enough samples', async () => {
    const out = join(dir, 'rehearsal-latency.json');
    writeFileSync(out, `${JSON.stringify({ alert_writer: { p50: 1, p90: 2, p99: 3 }, brief_writer: { p50: 800, p90: 2500, p99: 6000 } }, null, 2)}\n`);
    const r = await measureRehearsalLatency(dbs.owner, { outFile: out, now: NOW });
    expect(r.updated).toEqual(['brief_writer']);
    expect(r.kept).toEqual(['alert_writer']);
    const file = await loadRehearsalLatency(out);
    expect(file.alert_writer).toEqual({ p50: 1, p90: 2, p99: 3 });
    expect(file.brief_writer).toEqual({ p50: 550, p90: 910, p99: 991 });
  });
});
