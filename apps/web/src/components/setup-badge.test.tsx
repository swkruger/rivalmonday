// @vitest-environment jsdom
import type { SetupState } from '@cs/tools';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { openSetupSteps, SetupBadge } from './setup-badge';

afterEach(cleanup);

type State = Pick<SetupState, 'open' | 'steps' | 'totalSteps' | 'competitors'>;
const state = (o: Partial<State> = {}): State => ({
  open: true, totalSteps: 6, competitors: 'ready',
  steps: { details: 'done', lookup: 'done', profile: 'done', competitors: o.competitors ?? 'ready', invite: 'todo', billing: 'todo' }, ...o,
});

describe('openSetupSteps', () => {
  it('counts settled steps of the open setup out of the steps + the All set screen (staff)', () => {
    expect(openSetupSteps({ state: state() }, true)).toEqual({ open: true, doneSteps: 3, totalSteps: 7, waitingOnOwner: null });
    expect(openSetupSteps({ state: { ...state(), totalSteps: 5 } }, true)).toMatchObject({ totalSteps: 6 });
  });

  it('client roles never get a setup badge (owners never enter setup)', () => {
    expect(openSetupSteps({ state: state() }, false)).toBeNull();
    expect(openSetupSteps({ state: state({ competitors: 'waiting_owner' }) }, false)).toBeNull();
  });

  it('closed setups show nothing unless the owner was asked to pick', () => {
    expect(openSetupSteps({ state: state({ open: false, competitors: 'done' }) }, true)).toBeNull();
    expect(openSetupSteps(null, true)).toBeNull();
    const asked = state({ open: false, competitors: 'waiting_owner', steps: { details: 'done', lookup: 'done', profile: 'done', competitors: 'waiting_owner', invite: 'done', billing: 'skipped' } });
    expect(openSetupSteps({ state: asked, invite: { name: 'Maria Lopez' } }, true)).toEqual({ open: false, doneSteps: 6, totalSteps: 7, waitingOnOwner: { firstName: 'Maria' } });
  });
});

describe('SetupBadge', () => {
  it('shows "Setup n of N" while open', () => {
    render(<SetupBadge clientId="c1" open doneSteps={3} totalSteps={7} waitingOnOwner={null} />);
    const link = screen.getByRole('link', { name: 'Setup 3 of 7' });
    expect(link.getAttribute('href')).toBe('/c/c1/setup');
  });

  it('shows waiting on owner', () => {
    render(<SetupBadge clientId="c1" open={false} doneSteps={6} totalSteps={7} waitingOnOwner={{ firstName: 'Maria' }} />);
    expect(screen.getByRole('link', { name: 'Waiting on Maria' })).toBeTruthy();
    cleanup();
    render(<SetupBadge clientId="c1" open doneSteps={4} totalSteps={7} waitingOnOwner={{ firstName: null }} />);
    expect(screen.getByRole('link', { name: 'Setup 4 of 7 · Waiting on the owner' })).toBeTruthy();
  });

  it('renders nothing when closed and not waiting', () => {
    const { container } = render(<SetupBadge clientId="c1" open={false} doneSteps={6} totalSteps={7} waitingOnOwner={null} />);
    expect(container.innerHTML).toBe('');
  });
});
