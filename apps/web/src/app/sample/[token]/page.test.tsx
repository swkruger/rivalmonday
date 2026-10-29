// @vitest-environment jsdom
import type { BriefDetail } from '@cs/tools';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@cs/tools', () => ({ getSampleBrief: (...a: unknown[]) => m.get(...a) }));
vi.mock('@/server/tools', () => ({ toolDeps: (env: string) => ({ env }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ authSecret: 'AUTH-SECRET' }) }));
vi.mock('@/server/dev-guard', () => ({ activeEnvName: () => 'dev' }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('next/link', () => ({ default: (p: Record<string, unknown>) => <a data-next-link="1" {...p} /> }));
const { default: Page, metadata } = await import('./page');

const C = '00000000-0000-4000-8000-0000000000a1';
const E1 = '00000000-0000-4000-8000-0000000000e1';
const E2 = '00000000-0000-4000-8000-0000000000e2';
const TOKEN = `11111111-1111-4111-8111-111111111111.abc.${'x'.repeat(43)}`;
const brief: BriefDetail = {
  id: '00000000-0000-4000-8000-0000000000b1', clientId: C, deliveryDate: '2026-10-12', status: 'sent', kind: 'starting_point', summary: 'Where Smith Dental stands.',
  sentAt: '2026-10-12T12:00:00Z', generatedAt: '2026-10-11T12:00:00Z', hasPdf: true, periodStart: '2026-10-02T00:00:00Z', periodEnd: '2026-10-09T00:00:00Z', approvedAt: '2026-10-10T00:00:00Z',
  items: [{
    id: '00000000-0000-4000-8000-000000000001', ord: 1, competitorId: C, subject: 'competitor', competitorName: 'Bright Smiles', headline: 'Bright Smiles cut its cleaning price', whatChanged: 'W',
    whyItMatters: 'Y', recommendedAction: 'R', confidence: 0.9, effort: 'low', impact: 'high', evidenceIds: [E1, E2], status: 'active', upsellTag: null,
  }],
  scorecard: null, trend: null,
};
const ready = {
  brief, businessName: 'Smith Dental', timezone: 'America/Chicago', expiresAt: '2026-11-27T12:00:00.000Z',
  refs: [
    { evidenceId: E1, competitorName: 'Bright Smiles', channelLabel: 'Website', capturedAt: '2026-10-08T15:00:00.000Z', servable: true },
    { evidenceId: E2, competitorName: 'Bright Smiles', channelLabel: 'Google Business Profile', capturedAt: '2026-10-08T15:00:00.000Z', servable: false },
  ],
};
const params = (token = TOKEN) => ({ params: Promise.resolve({ token }) });

beforeEach(() => m.get.mockReset());
afterEach(cleanup);

describe('/sample/<token>', () => {
  it('page 404s on a bad token', async () => {
    m.get.mockResolvedValue(null);
    await expect(Page(params('bad'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.get.mock.calls[0]!.slice(0, 3)).toEqual([{ env: 'dev' }, 'bad', 'AUTH-SECRET']);
    expect(m.get.mock.calls[0]![3]).toBeInstanceOf(Date);
  });

  it('page renders the brief with sample evidence links and no app links', async () => {
    m.get.mockResolvedValue(ready);
    const { container } = render(await Page(params()));
    expect(screen.getByText('Sample brief')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Starting point for Smith Dental');
    expect(screen.getByText('Prepared by Rival Monday from public information. Every claim links to the evidence behind it.')).toBeTruthy();
    expect(screen.getByText('Bright Smiles cut its cleaning price')).toBeTruthy();
    expect(container.textContent).toContain("This is the first brief your clients would get, under your agency's brand. This link works until Nov 27, 2026.");
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([`/sample/${TOKEN}/evidence/${E1}`]); // only sample evidence links; E2 (vendor data) is a plain chip
    expect(container.querySelector('span[data-slot="citation-pill"]')?.getAttribute('aria-label')).toMatch(/^Evidence 2: Bright Smiles/);
    expect(screen.getByRole('link', { name: /Evidence 1: Bright Smiles/ })).toBeTruthy();
    expect(screen.queryByText('Download PDF')).toBeNull();
    expect(container.querySelector('nav')).toBeNull();
    expect(container.textContent).not.toMatch(/Ask|Friday/);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
