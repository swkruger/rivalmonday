import { describe, expect, it } from 'vitest';
import type { ClientSetupView } from './types';
import { currentStep, stepsFor, wizardStep } from './wizard-steps';

type Steps = ClientSetupView['state']['steps'];
const view = (steps: Partial<Steps>, totalSteps: 4 | 5 = 5) =>
  ({ state: { steps: { profile: 'done', search: 'done', competitors: 'done', ...steps }, totalSteps } }) as unknown as ClientSetupView;

describe('setup wizard steps (shared by the wizard and its PageHeader)', () => {
  it('staff see 5 steps (4 for a prospect), client roles their own 3', () => {
    expect(stepsFor(true, 5).map((s) => s.key)).toEqual(['profile', 'search', 'competitors', 'invite', 'billing']);
    expect(stepsFor(true, 4)).toHaveLength(4);
    expect(stepsFor(false, 5).map((s) => s.key)).toEqual(['profile', 'search', 'competitors']);
  });

  it('the current step is the first open one, else the last', () => {
    expect(currentStep({ profile: 'done', search: 'running', competitors: 'todo' } as Steps, stepsFor(false, 5))).toBe('search');
    expect(currentStep({ profile: 'done', search: 'done', competitors: 'done' } as Steps, stepsFor(false, 5))).toBe('competitors');
  });

  it('"Step n of N" follows the current step', () => {
    expect(wizardStep(view({ profile: 'todo', search: 'todo', competitors: 'todo', invite: 'todo', billing: 'todo' }), true)).toEqual({ n: 1, of: 5 });
    expect(wizardStep(view({ invite: 'todo', billing: 'todo' }), true)).toEqual({ n: 4, of: 5 });
    expect(wizardStep(view({ competitors: 'todo' }), false)).toEqual({ n: 3, of: 3 });
    expect(wizardStep(view({ competitors: 'blocked', invite: 'todo' }, 4), true)).toEqual({ n: 3, of: 4 });
  });
});
