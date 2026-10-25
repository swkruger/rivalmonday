import { DEMO_OPERATOR_EMAIL } from '@cs/demo/users';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./env', () => ({
  webEnv: () => ({ queueDatabaseUrl: 'postgres://queue', appDatabaseUrl: 'postgres://app', serviceDatabaseUrl: 'postgres://service', platformAdmins: [] }),
}));
import { envUrls, platformAdminsFor } from './runtime-env';

describe('envUrls', () => {
  it('envUrls exposes queue', () => {
    // DEV's queue URL is the worker's DATABASE_URL (cs_worker in production), never an owner URL.
    expect(envUrls('dev')).toEqual({ queue: 'postgres://queue', app: 'postgres://app', service: 'postgres://service' });
  });
});

describe('platformAdminsFor (spec §5.4)', () => {
  it('adds the demo operator in memory only for DEMO and TEST with the guard on', () => {
    expect(platformAdminsFor(['owner@x.co'], 'demo', true)).toEqual(['owner@x.co', DEMO_OPERATOR_EMAIL]);
    expect(platformAdminsFor(['owner@x.co'], 'test', true)).toEqual(['owner@x.co', DEMO_OPERATOR_EMAIL]);
    expect(platformAdminsFor(['owner@x.co'], 'dev', true)).toEqual(['owner@x.co']);
    expect(platformAdminsFor(['owner@x.co'], 'demo', false)).toEqual(['owner@x.co']);
  });
});
