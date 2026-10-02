import { stageRun } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimStage, MAX_STAGE_ATTEMPTS, runStage, stageDone } from './stage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(() => truncateAll(dbs.owner));

const subject = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const key = { stage: 'test', version: 1, subjectId: subject(1) };
const row = async (k = key) =>
  (await dbs.owner.select().from(stageRun).where(and(eq(stageRun.stage, k.stage), eq(stageRun.stageVersion, k.version), eq(stageRun.subjectId, k.subjectId))))[0];

describe('stage runner', () => {
  it('runs a subject once: compute, commit and the done marker; a done stage never re-runs', async () => {
    expect(await runStage(dbs.service, key, async () => 1, async (_tx, n) => n + 1)).toEqual({ ran: true, result: 2 });
    expect(await stageDone(dbs.service, key)).toBe(true);
    expect(await runStage(dbs.service, key, async () => 1, async () => 3)).toEqual({ ran: false });
    expect(await claimStage(dbs.service, key)).toBe(false);
  });

  it('lets exactly one of several concurrent claims win', async () => {
    const claims = await Promise.all(Array.from({ length: 5 }, () => claimStage(dbs.service, key)));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it('rolls back commit outputs on failure, records the error, and stops after the attempt cap', async () => {
    const marker = { stage: 'marker', version: 1, subjectId: subject(2) };
    const failing = () =>
      runStage(dbs.service, key, async () => 'x', async (tx) => {
        await tx.insert(stageRun).values({ stage: marker.stage, stageVersion: marker.version, subjectId: marker.subjectId, status: 'done' });
        throw new Error('boom');
      });
    await expect(failing()).rejects.toThrow('boom');
    expect(await row(marker)).toBeUndefined();
    expect(await row()).toMatchObject({ status: 'failed', attempts: 1, error: 'boom' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 2; i <= MAX_STAGE_ATTEMPTS; i++) await expect(failing()).rejects.toThrow('boom');
    warn.mockRestore();
    expect((await row())?.attempts).toBe(MAX_STAGE_ATTEMPTS);
    expect(await runStage(dbs.service, key, async () => 1, async () => 1)).toEqual({ ran: false });
  });

  it('warns once a subject exhausts its attempts, and not before', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const failing = () => runStage(dbs.service, key, async () => { throw new Error('model down'); }, async () => 1);
      for (let i = 1; i < MAX_STAGE_ATTEMPTS; i++) await expect(failing()).rejects.toThrow('model down');
      expect(warn).not.toHaveBeenCalled();
      await expect(failing()).rejects.toThrow('model down');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toBe(`[engine] stage test v1 exhausted for subject ${key.subjectId}: model down`);
    } finally {
      warn.mockRestore();
    }
  });

  it('marks a compute failure (e.g. a model outage) as failed without writing outputs', async () => {
    await expect(runStage(dbs.service, key, async () => { throw new Error('model down'); }, async () => 1)).rejects.toThrow('model down');
    expect(await row()).toMatchObject({ status: 'failed', error: 'model down' });
    expect(await runStage(dbs.service, key, async () => 5, async (_tx, n) => n)).toEqual({ ran: true, result: 5 });
  });

  it('re-claims a run left "running" by a crashed worker after the stale window', async () => {
    expect(await claimStage(dbs.service, key)).toBe(true);
    expect(await claimStage(dbs.service, key)).toBe(false);
    await dbs.owner.execute(sql`UPDATE stage_run SET started_at = now() - interval '2 hours'`);
    expect(await claimStage(dbs.service, key)).toBe(true);
    expect((await row())?.attempts).toBe(2);
  });

  it('treats a new stage version as a new subject', async () => {
    await runStage(dbs.service, key, async () => 0, async () => 0);
    expect(await claimStage(dbs.service, { ...key, version: 2 })).toBe(true);
  });
});
