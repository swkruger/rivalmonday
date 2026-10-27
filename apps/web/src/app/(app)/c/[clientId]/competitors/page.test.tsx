// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const callTool = vi.fn(async (_c: unknown, name: string) => {
  if (name === 'get_client_profile') return { id: 'c1', name: 'Cool Air', status: 'active', timezone: 'America/Chicago', keywords: [], serviceArea: null, placeId: null };
  if (name === 'list_client_competitors') return { items: [], limit: 5 };
  if (name === 'get_competitor_signals') return { competitors: [] };
  throw new Error(`unexpected ${name}`);
});
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', userId: 'u1', features: new Set(['dashboard']), permissions: new Set() } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: [unknown, string]) => callTool(...a), tryCallTool: (...a: [unknown, string]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/components/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/help/help-context', () => ({ HelpText: () => null }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => <button type="button">tip</button> }));
vi.mock('./competitor-controls', () => ({ AddCompetitorForm: () => null, SuggestionsPanel: () => null, TrackedCompetitorsTable: () => null }));

import CompetitorsPage from './page';

describe('CompetitorsPage', () => {
  it('Tracked competitors is a Section with its tip beside the heading, and no card wraps the table', async () => {
    const { container } = render(await CompetitorsPage({ params: Promise.resolve({ clientId: 'c1' }) }));
    const sections = container.querySelectorAll('section[data-slot=section]');
    expect(sections).toHaveLength(1);
    const heading = sections[0]!.querySelector('h2');
    expect(heading?.textContent).toBe('Tracked competitors');
    expect(heading?.querySelector('button')).toBeNull();
    expect(sections[0]!.querySelector('[data-slot=section-head] button')).not.toBeNull();
    expect(container.querySelector('[data-slot=card]')).toBeNull();
  });
});
