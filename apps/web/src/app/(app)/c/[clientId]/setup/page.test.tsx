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
  it('finished setup shows a "Needs attention" chip for a blocked step', async () => {
    callTool.mockImplementation(async (_ctx: unknown, name: string) =>
      name === 'get_client_profile' ? { id: C, name: 'Cool Air' } : { state: { open: false, dismissedAt: null, steps: { profile: 'done', search: 'blocked', competitors: 'skipped' } } });
    render(await SetupPage({ params: Promise.resolve({ clientId: C }) }));
    const chip = screen.getByText('Needs attention');
    expect(chip.getAttribute('data-slot')).toBe('status-chip');
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Skipped')).toBeTruthy();
  });
});
