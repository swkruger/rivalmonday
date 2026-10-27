import { describe, expect, it } from 'vitest';
import type { ClientSetupView } from './types';
import { firstOpenStep, resolveStep, stepNumber, STEP_LABELS, stepHref, wizardSteps } from './wizard-steps';

type State = ClientSetupView['state'];
const DONE = { details: 'done', lookup: 'done', profile: 'done', competitors: 'done', invite: 'done', billing: 'done' } as const;
const state = (o: { steps?: Partial<State['steps']>; competitors?: State['competitors']; open?: boolean } = {}) => {
  const competitors = o.competitors ?? 'done';
  return { steps: { ...DONE, ...o.steps, competitors }, competitors, open: o.open ?? true } as unknown as State;
};

describe('client setup wizard steps (16 §6)', () => {
  it('admin active client has 7 screens', () => {
    expect(wizardSteps(true, 6)).toEqual(['details', 'lookup', 'profile', 'competitors', 'invite', 'billing', 'done']);
  });

  it('non-admin has 6', () => {
    expect(wizardSteps(false, 6)).toEqual(['details', 'lookup', 'profile', 'competitors', 'invite', 'done']);
  });

  it('prospect has 6', () => {
    // A prospect has no billing step in the setup state (totalSteps 5), whoever is looking.
    expect(wizardSteps(true, 5)).toEqual(['details', 'lookup', 'profile', 'competitors', 'invite', 'done']);
    expect(wizardSteps(false, 5)).toHaveLength(6);
  });

  it('numbers a step by its place in the list', () => {
    expect(stepNumber('profile', wizardSteps(true, 6))).toBe(3);
    expect(stepNumber('done', wizardSteps(true, 6))).toBe(7);
    expect(stepNumber('done', wizardSteps(false, 6))).toBe(6);
  });

  it('opens on the first step nobody has settled', () => {
    const steps = wizardSteps(true, 6);
    expect(firstOpenStep(state({ steps: { profile: 'todo' }, competitors: 'todo' }), steps)).toBe('profile');
    expect(firstOpenStep(state({ competitors: 'searching' }), steps)).toBe('competitors');
    expect(firstOpenStep(state({ competitors: 'ready' }), steps)).toBe('competitors');
    expect(firstOpenStep(state({ competitors: 'blocked' }), steps)).toBe('competitors');
    expect(firstOpenStep(state({ steps: { invite: 'todo' } }), steps)).toBe('invite');
    expect(firstOpenStep(state({ steps: { billing: 'todo' } }), steps)).toBe('billing');
    expect(firstOpenStep(state(), steps)).toBe('done');
  });

  it('asked-the-owner counts as settled for competitors; skipped steps are settled', () => {
    const steps = wizardSteps(true, 6);
    expect(firstOpenStep(state({ competitors: 'waiting_owner', steps: { invite: 'todo' } }), steps)).toBe('invite');
    expect(firstOpenStep(state({ competitors: 'skipped', steps: { invite: 'skipped', billing: 'skipped' } }), steps)).toBe('done');
  });

  it('billing is only a step where the list has it', () => {
    expect(firstOpenStep(state({ steps: { billing: 'todo' } }), wizardSteps(false, 6))).toBe('done');
  });

  it('a requested step may be at or before the first open one, never past it; a closed setup shows the last screen', () => {
    const steps = wizardSteps(true, 6);
    const open = state({ steps: { invite: 'todo', billing: 'todo' } });
    expect(resolveStep('profile', open, steps)).toBe('profile');
    expect(resolveStep('invite', open, steps)).toBe('invite');
    expect(resolveStep('billing', open, steps)).toBe('invite');
    expect(resolveStep(undefined, open, steps)).toBe('invite');
    expect(resolveStep('nonsense', open, steps)).toBe('invite');
    // details/lookup happen before the client exists: never a setup page.
    expect(resolveStep('details', open, steps)).toBe('invite');
    expect(resolveStep('profile', state({ open: false }), steps)).toBe('done');
  });

  it('labels and links', () => {
    expect(STEP_LABELS.profile).toBe('What they do and where');
    expect(stepHref('c1', 'competitors')).toBe('/c/c1/setup?step=competitors');
  });
});
