import { membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedAuthUsers, truncateAuth } from '../../test/auth-fixtures';
import type { RequestHost } from './request-host';
import { resolveViewer } from './viewer';

/**
 * Launch gate (13a1 Task 15): a 404 or a page redirect re-renders the root layout with a fresh React `cache()`, so the viewer
 * resolves twice. The Decision 16 client-hint lookup must not add its own sequential stage: it starts beside `listMemberships`.
 */
const gate = vi.hoisted(() => ({ release: null as null | (() => void), held: false }));
vi.mock('@cs/tools', async (orig) => {
  const actual = await orig<typeof import('@cs/tools')>();
  return {
    ...actual,
    listMemberships: async (...args: Parameters<typeof actual.listMemberships>) => {
      if (gate.held) await new Promise<void>((r) => { gate.release = r; });
      return actual.listMemberships(...args);
    },
  };
});

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const S = ['k'.repeat(40)];
const session = { userId: 'u1', email: 'p@e.co', name: 'Pat' };
const PLATFORM_HOST: RequestHost = { origin: 'https://app.example', info: { kind: 'platform' } };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedAuthUsers(dbs.owner, { id: 'u1', email: 'p@e.co', name: 'Pat' });
});

describe('resolveViewer stages', () => {
  it('starts the client-hint lookup before the memberships are listed (one stage, not two), same pick', async () => {
    const [own] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, createdBy: 't', createdAt: new Date('2026-10-01T00:00:00Z') }).returning();
    const [adminB] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyB, role: 'agency_admin', createdBy: 't' }).returning();
    const selects: string[] = [];
    const service = new Proxy(dbs.service, {
      get(t, p, r) {
        const v = Reflect.get(t, p, r);
        if (p !== 'select') return v;
        return (...a: unknown[]) => {
          selects.push(Object.keys((a[0] as object | undefined) ?? {}).join(','));
          return (v as (...x: unknown[]) => unknown).apply(t, a);
        };
      },
    });
    gate.held = true;
    const pending = resolveViewer({ host: PLATFORM_HOST, path: '/', platformOrigin: 'https://app.example', service, session, membershipCookie: own!.id, clientHint: IDS.clientB1, linkSecrets: S });
    await new Promise((r) => setImmediate(r));
    expect(selects).toContain('agencyId'); // the hint lookup is already running while listMemberships waits
    gate.held = false;
    gate.release!();
    expect(await pending).toMatchObject({ kind: 'user', membership: { id: adminB!.id } });
  });
});
