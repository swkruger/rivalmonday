// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'agency_admin' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

vi.mock('./setup-wizard', () => ({ SetupWizard: () => null }));

import SetupPage from './page';

const C = '00000000-0000-4000-8000-0000000000c1';

describe('Setup page', () => {
  it('finished setup shows a status chip per step, "Waiting on the owner" for an owner pick', async () => {
    callTool.mockImplementation(async (_ctx: unknown, name: string) =>
      name === 'get_client_profile' ? { id: C, name: 'Cool Air' } : {
        state: { open: false, dismissedAt: null, competitors: 'waiting_owner', steps: { details: 'done', lookup: 'done', profile: 'done', competitors: 'waiting_owner', invite: 'skipped' } },
      });
    render(await SetupPage({ params: Promise.resolve({ clientId: C }) }));
    const chip = screen.getByText('Waiting on the owner');
    expect(chip.getAttribute('data-slot')).toBe('status-chip');
    expect(screen.getAllByText('Done')).toHaveLength(3);
    expect(screen.getByText('Skipped')).toBeTruthy();
    expect(screen.getByText('What they do and where')).toBeTruthy();
  });

  it('a blocked competitors step reads "Needs attention"', async () => {
    callTool.mockImplementation(async (_ctx: unknown, name: string) =>
      name === 'get_client_profile' ? { id: C, name: 'Cool Air' } : {
        state: { open: false, dismissedAt: null, competitors: 'blocked', steps: { details: 'done', lookup: 'done', profile: 'done', competitors: 'blocked', invite: 'done' } },
      });
    render(await SetupPage({ params: Promise.resolve({ clientId: C }) }));
    expect(screen.getByText('Needs attention').getAttribute('data-slot')).toBe('status-chip');
  });
});
