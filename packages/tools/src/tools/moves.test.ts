import { clientCompetitor, move } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MoveDetail, MoveRow } from './schemas';
import { ctx, dbs, registry, resetWorkspace, seedEvent, seedMove } from './workspace-fixtures';

const am = ctx('account_manager', 'all');
const owner = ctx('client_owner', [IDS.clientA1], ['dashboard']);
const ownerNoDash = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', [], IDS.agencyB);

beforeEach(resetWorkspace);

describe('list_moves', () => {
  it('lists open moves with live event counts and the shown status', async () => {
    const a = await seedEvent({ score: 86, route: 'alert', ageDays: 3 });
    const b = await seedEvent({ score: 60, route: 'brief', ageDays: 2, retracted: true });
    const m = await seedMove([a.eventId, b.eventId], { status: 'active' });
    await seedMove([a.eventId], { closed: true });
    const r = (await registry.invoke(am, 'list_moves', { clientId: IDS.clientA1 })) as { items: MoveRow[] };
    expect(r.items).toEqual([expect.objectContaining({ id: m, label: 'Price war', status: 'active', eventCount: 1, competitorName: 'Smith HVAC' })]);
    const closed = (await registry.invoke(am, 'list_moves', { clientId: IDS.clientA1, status: 'closed' })) as { items: MoveRow[] };
    expect(closed.items.map((x) => x.status)).toEqual(['closed']);
  });

  it('drops moves whose events were all retracted, and moves of untracked competitors (Review Focus 3)', async () => {
    const r1 = await seedEvent({ score: 86, route: 'alert', ageDays: 3, retracted: true });
    await seedMove([r1.eventId]);
    expect(((await registry.invoke(am, 'list_moves', { clientId: IDS.clientA1 })) as { items: MoveRow[] }).items).toEqual([]);
    const live = await seedEvent({ score: 86, route: 'alert', ageDays: 3 });
    // F3: a second OPEN move for the same (client, competitor, moveType) violates move_open_unique — use a different moveType.
    await seedMove([live.eventId], { moveType: 'ad_surge' });
    await dbs.owner.delete(clientCompetitor).where(eq(clientCompetitor.competitorId, IDS.competitorX));
    expect(((await registry.invoke(am, 'list_moves', { clientId: IDS.clientA1 })) as { items: MoveRow[] }).items).toEqual([]);
  });

  it('needs dashboard for client users; other tenants see nothing', async () => {
    await expect(registry.invoke(ownerNoDash, 'list_moves', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(otherAgency, 'list_moves', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('get_move', () => {
  it('returns facts and the live evidence chain, newest first', async () => {
    const older = await seedEvent({ score: 60, route: 'brief', ageDays: 5 });
    const newer = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    const gone = await seedEvent({ score: 70, route: 'alert', ageDays: 2, retracted: true });
    const m = await seedMove([older.eventId, newer.eventId, gone.eventId]);
    await dbs.owner.update(move).set({ details: { eventCount: 3, channels: ['web'], facts: { price_cuts: 2, max_cut_pct: 20 } } }).where(eq(move.id, m));
    const d = (await registry.invoke(owner, 'get_move', { clientId: IDS.clientA1, moveId: m })) as MoveDetail;
    expect(d.events.map((e) => e.eventId)).toEqual([newer.eventId, older.eventId]);
    expect(d.facts).toEqual([{ label: 'Price cuts', value: '2' }, { label: 'Max cut pct', value: '20' }]);
  });

  it('is not found for another client’s move', async () => {
    const e = await seedEvent({ score: 86, route: 'alert', ageDays: 1 });
    const m = await seedMove([e.eventId]);
    await expect(registry.invoke(ctx('client_owner', [IDS.clientA2], ['dashboard']), 'get_move', { clientId: IDS.clientA2, moveId: m })).rejects.toMatchObject({ code: 'not_found' });
  });
});
