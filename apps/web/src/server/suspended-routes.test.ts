import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as Record<string, unknown> | null, suspended: false }));
vi.mock('@/server/current-viewer', () => ({ getViewer: async () => m.viewer }));
vi.mock('@/server/billing-state', () => ({ agencySuspended: async () => m.suspended }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {}, app: {} }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'test' }));
vi.mock('@/server/files', () => ({ servePdf: async () => new Response('pdf'), serveEvidence: async () => new Response('evidence'), serveRankMap: async () => new Response('map') }));
vi.mock('@/server/store', () => ({ webStore: () => ({}) }));
vi.mock('@/server/queue', () => ({ pdfEnqueueFor: () => ({}) }));
vi.mock('@/server/tools', () => ({ registry: () => ({}) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'http://localhost:3000' }) }));
vi.mock('@/server/links', () => ({ goGate: (v: unknown) => ({ kind: 'ok', viewer: v }), goDestination: async () => '/inbox' }));

const ID = '11111111-1111-4111-8111-111111111111';
const calls = {
  brief: async () => (await import('@/app/files/brief/[id]/route')).GET(new Request('http://x'), { params: Promise.resolve({ id: ID }) }),
  report: async () => (await import('@/app/files/report/[id]/route')).GET(new Request('http://x'), { params: Promise.resolve({ id: ID }) }),
  evidence: async () => (await import('@/app/files/evidence/[clientId]/[evidenceId]/route')).GET(new Request('http://x'), { params: Promise.resolve({ clientId: ID, evidenceId: ID }) }),
  rankMap: async () => (await import('@/app/files/rank-map/[clientId]/route')).GET(new Request('http://x'), { params: Promise.resolve({ clientId: ID }) }),
  go: async () => (await import('@/app/go/[target]/[id]/route')).GET(new Request('http://x'), { params: Promise.resolve({ target: 'brief', id: ID }) }),
};

beforeEach(() => {
  m.viewer = { kind: 'user', ctx: { role: 'client_owner', agencyId: 'a1' } };
  m.suspended = false;
});

describe('file and link routes while the agency is suspended (billing)', () => {
  for (const [name, call] of Object.entries(calls)) {
    it(`${name}: 404 when suspended, served when active`, async () => {
      m.suspended = true;
      expect((await call()).status).toBe(404);
      m.suspended = false;
      expect((await call()).status).not.toBe(404);
    });
  }
});
