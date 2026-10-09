import { DEMO_OPERATOR_EMAIL } from '@cs/demo/users';
import { describe, expect, it } from 'vitest';
import { platformAdminsFor } from './runtime-env';

describe('platformAdminsFor (spec §5.4)', () => {
  it('adds the demo operator in memory only for DEMO and TEST with the guard on', () => {
    expect(platformAdminsFor(['owner@x.co'], 'demo', true)).toEqual(['owner@x.co', DEMO_OPERATOR_EMAIL]);
    expect(platformAdminsFor(['owner@x.co'], 'test', true)).toEqual(['owner@x.co', DEMO_OPERATOR_EMAIL]);
    expect(platformAdminsFor(['owner@x.co'], 'dev', true)).toEqual(['owner@x.co']);
    expect(platformAdminsFor(['owner@x.co'], 'demo', false)).toEqual(['owner@x.co']);
  });
});
