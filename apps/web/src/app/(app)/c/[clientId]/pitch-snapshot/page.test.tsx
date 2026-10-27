// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'account_manager' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import PitchSnapshotPage from './page';

const C = '00000000-0000-4000-8000-0000000000c1';

describe('Pitch snapshot page', () => {
  beforeAll(() => {
    callTool.mockImplementation(async (_ctx: unknown, name: string) => {
      if (name === 'get_client_profile') return { id: C, name: 'Cool Air', timezone: 'America/Chicago' };
      return { report: { status: 'ready', createdAt: '2026-10-08T01:00:00.000Z', finishedAt: '2026-10-08T02:00:00.000Z', data: { generatedAt: '2026-10-08T02:00:00.000Z', keywords: [], points: 9, scanId: null, notes: [], businesses: [] } } };
    });
  });

  it('chart sits in a titleless Section, not a bordered wrapper', async () => {
    const { container } = render(await PitchSnapshotPage({ params: Promise.resolve({ clientId: C }) }));
    expect(container.querySelector('[data-slot=section]')).toBeTruthy();
    expect(container.querySelector('.rounded-md.border')).toBeNull();
  });

  it('pitch snapshot generated date in the client zone', async () => {
    render(await PitchSnapshotPage({ params: Promise.resolve({ clientId: C }) }));
    expect(screen.getAllByText(/Generated Oct 7\b/).length).toBeGreaterThan(0);
  });
});
