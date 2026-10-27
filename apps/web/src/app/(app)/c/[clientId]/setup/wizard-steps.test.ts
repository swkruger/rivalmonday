import { describe, expect, it } from 'vitest';
import type { ClientSetupView } from './types';
import { currentStep, type LegacySteps, legacySteps, stepsFor, wizardStep } from './wizard-steps';

type State = ClientSetupView['state'];
const DONE = { details: 'done', lookup: 'done', profile: 'done', competitors: 'done', invite: 'done', billing: 'done' } as const;
const view = (o: { steps?: Partial<State['steps']>; competitors?: State['competitors']; totalSteps?: 5 | 6 } = {}) => {
  const competitors = o.competitors ?? 'done';
  return { state: { steps: { ...DONE, ...o.steps, competitors }, competitors, totalSteps: o.totalSteps ?? 6 } } as unknown as ClientSetupView;
};

describe('setup wizard steps (shared by the wizard and its PageHeader)', () => {
  it('staff see 5 steps (4 for a prospect), client roles their own 3', () => {
    expect(stepsFor(true, 5).map((s) => s.key)).toEqual(['profile', 'search', 'competitors', 'invite', 'billing']);
    expect(stepsFor(true, 4)).toHaveLength(4);
    expect(stepsFor(false, 5).map((s) => s.key)).toEqual(['profile', 'search', 'competitors']);
  });

  it('the current step is the first open one, else the last', () => {
    expect(currentStep({ profile: 'done', search: 'running', competitors: 'todo' } as LegacySteps, stepsFor(false, 5))).toBe('search');
    expect(currentStep({ profile: 'done', search: 'done', competitors: 'done' } as LegacySteps, stepsFor(false, 5))).toBe('competitors');
  });

  it('maps the merged competitors step onto the interim search + pick steps', () => {
    const m = (competitors: State['competitors'], agency = true) => legacySteps(view({ competitors }).state, agency);
    expect(m('todo')).toMatchObject({ search: 'todo', competitors: 'todo' });
    expect(m('searching')).toMatchObject({ search: 'running', competitors: 'todo' });
    expect(m('blocked')).toMatchObject({ search: 'blocked', competitors: 'todo' });
    expect(m('ready')).toMatchObject({ search: 'done', competitors: 'todo' });
    expect(m('skipped')).toMatchObject({ search: 'done', competitors: 'skipped' });
    // Asked to pick: settled for staff (on to the invite step), the pick screen for the owner.
    expect(m('waiting_owner')).toMatchObject({ search: 'done', competitors: 'done' });
    expect(m('waiting_owner', false)).toMatchObject({ search: 'done', competitors: 'todo' });
  });

  it('"Step n of N" follows the current step', () => {
    expect(wizardStep(view({ steps: { profile: 'todo', invite: 'todo', billing: 'todo' }, competitors: 'todo' }), true)).toEqual({ n: 1, of: 5 });
    expect(wizardStep(view({ steps: { invite: 'todo', billing: 'todo' } }), true)).toEqual({ n: 4, of: 5 });
    expect(wizardStep(view({ competitors: 'waiting_owner' }), false)).toEqual({ n: 3, of: 3 });
    expect(wizardStep(view({ competitors: 'blocked', steps: { invite: 'todo' }, totalSteps: 5 }), true)).toEqual({ n: 2, of: 4 });
  });
});
