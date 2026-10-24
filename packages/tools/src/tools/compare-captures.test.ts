import { capture, captureBlock, stageRun, volatileBlock } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { count } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CaptureCompareView } from './schemas';
import { ago, ctx, dbs, pageId, registry, resetWorkspace, seedCapture, seedPage } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
beforeEach(resetWorkspace);

const cmp = (captureId: string, clientId: string = IDS.clientA1) => registry.invoke(am, 'compare_captures', { clientId, captureId }) as Promise<CaptureCompareView>;

/** A capture of `page` at `at` with blocks `[key, text]` (ord = index). */
async function cap(at: Date, blocks: [string, string][] | null, o: { page?: string; status?: string; competitorId?: string } = {}) {
  const competitorId = o.competitorId ?? IDS.competitorX;
  const page = o.page ?? pageId;
  const c = await seedCapture({ at, status: o.status, kinds: [], competitorId, pageId: page });
  if (blocks?.length) {
    await dbs.owner.insert(captureBlock).values(blocks.map(([blockKey, text], ord) => ({ captureId: c.captureId, competitorId, trackedPageId: page, ord, blockKey, path: 'main/p', text, textSha: `sha-${text.length}-${ord}` })));
  }
  return c.captureId;
}

describe('compare_captures', () => {
  it('pairs the previous ok web capture of the same page', async () => {
    const other = await seedPage({ url: 'https://smithhvac.example/other' });
    const prev = await cap(ago(3), [['k1', 'old text']]);
    await cap(ago(2), [['k1', 'failed text']], { status: 'failed' });
    await cap(ago(2), [['k1', 'other page']], { page: other });
    await cap(ago(0.5), [['k1', 'newer than after']]);
    const after = await cap(ago(1), [['k1', 'new text']]);
    const v = await cmp(after);
    expect(v.state).toBe('ok');
    expect(v.before?.captureId).toBe(prev);
    expect(v.after.captureId).toBe(after);
    expect(v.blocks).toEqual([{ kind: 'modified', segments: [{ op: 'delete', text: 'old' }, { op: 'insert', text: 'new' }, { op: 'equal', text: ' text' }] }]);
  });

  it('first capture -> state first', async () => {
    const after = await cap(ago(1), [['k1', 'x']]);
    expect(await cmp(after)).toMatchObject({ state: 'first', before: null, blocks: [] });
  });

  it('no blocks on the after capture -> no_blocks', async () => {
    await cap(ago(3), [['k1', 'x']]);
    const failed = await cap(ago(2), null, { status: 'failed' });
    const empty = await cap(ago(1), null);
    expect((await cmp(failed)).state).toBe('no_blocks');
    expect((await cmp(empty)).state).toBe('no_blocks');
  });

  it('no blocks on the previous capture -> no_blocks with before', async () => {
    const prev = await cap(ago(2), null);
    const after = await cap(ago(1), [['k1', 'x']]);
    const v = await cmp(after);
    expect(v.state).toBe('no_blocks');
    expect(v.before?.captureId).toBe(prev);
  });

  it('vendor capture -> not_web', async () => {
    const c = await seedCapture({ source: 'gbp' as never, kinds: [] });
    expect((await cmp(c.captureId)).state).toBe('not_web');
  });

  it("another client's capture is not_found", async () => {
    const c = await cap(ago(1), [['k1', 'x']], { competitorId: IDS.competitorY, page: await seedPage({ competitorId: IDS.competitorY }) });
    await expect(cmp(c)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('added, removed, modified and unchanged kinds', async () => {
    await cap(ago(2), [['a', 'stays the same'], ['b', 'price is $99 today'], ['c', 'gone entirely different words here']]);
    const after = await cap(ago(1), [['a', 'stays the same'], ['b', 'price is $79 today'], ['d', 'brand new block nothing alike zebra']]);
    const v = await cmp(after);
    expect(v.blocks.map((b) => b.kind).sort()).toEqual(['added', 'modified', 'removed', 'unchanged']);
    expect(v.blocks.find((b) => b.kind === 'unchanged')!.segments).toEqual([{ op: 'equal', text: 'stays the same' }]);
    expect(v.blocks.find((b) => b.kind === 'added')!.segments).toEqual([{ op: 'insert', text: 'brand new block nothing alike zebra' }]);
    expect(v.blocks.find((b) => b.kind === 'removed')!.segments).toEqual([{ op: 'delete', text: 'gone entirely different words here' }]);
    expect(v.truncated).toBe(false);
    expect(v.blocksCapped).toBe(false);
  });

  it('masked keys are left out and counted', async () => {
    await cap(ago(2), [['a', 'one'], ['m', 'clock 10:01']]);
    const after = await cap(ago(1), [['a', 'one'], ['m', 'clock 10:02']]);
    await dbs.owner.insert(volatileBlock).values({ trackedPageId: pageId, competitorId: IDS.competitorX, blockKey: 'm' } as never);
    const v = await cmp(after);
    expect(v.maskedCount).toBe(1);
    expect(v.blocks).toHaveLength(1);
    expect(v.blocks[0]!.kind).toBe('unchanged');
  });

  it('masks an alignment when the before key is masked and the after key differs', async () => {
    await cap(ago(2), [['a', 'one'], ['m', 'clock 10:01']]);
    const after = await cap(ago(1), [['a', 'one'], ['n', 'clock 10:02']]);
    await dbs.owner.insert(volatileBlock).values({ trackedPageId: pageId, competitorId: IDS.competitorX, blockKey: 'm' } as never);
    const v = await cmp(after);
    expect(v.maskedCount).toBe(1);
    expect(v.blocks).toHaveLength(1);
  });

  it('caps blocks at MAX_COMPARE_BLOCKS and sets blocksCapped, not truncated', async () => {
    const mk = (s: string): [string, string][] => Array.from({ length: 601 }, (_, i) => [`k${i}`, `${s} ${i}`]);
    await cap(ago(2), mk('same'));
    const after = await cap(ago(1), mk('same'));
    const v = await cmp(after);
    expect(v.blocks).toHaveLength(600);
    expect(v.blocksCapped).toBe(true);
    expect(v.truncated).toBe(false);
  });

  it('page budget sets truncated and falls back to delete+insert', async () => {
    const words = (w: string) => Array.from({ length: 500 }, (_, i) => `${w}${i % 7}`).join(' ');
    const mk = (w: string): [string, string][] => Array.from({ length: 6 }, (_, i) => [`k${i}`, `${words(w)} ${i}`]);
    await cap(ago(2), mk('a'));
    const after = await cap(ago(1), mk('b'));
    const v = await cmp(after);
    expect(v.truncated).toBe(true);
    const plain = v.blocks.filter((b) => b.segments.length === 2 && b.segments[0]!.op === 'delete' && b.segments[1]!.op === 'insert');
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.length).toBeLessThan(6);
  });

  it('never writes', async () => {
    await cap(ago(2), [['a', 'one']]);
    const after = await cap(ago(1), [['a', 'two']]);
    const n = async () => [(await dbs.owner.select({ n: count() }).from(captureBlock))[0]!.n, (await dbs.owner.select({ n: count() }).from(stageRun))[0]!.n, (await dbs.owner.select({ n: count() }).from(capture))[0]!.n];
    const before = await n();
    await cmp(after);
    expect(await n()).toEqual(before);
  });
});
