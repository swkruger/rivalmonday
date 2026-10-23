// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({ calls: [] as [string, unknown][], answer: {} as Record<string, unknown> }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/tools', () => ({
  callTool: async (_c: unknown, name: string, input: unknown) => {
    m.calls.push([name, input]);
    return name === 'list_help_guides' ? { guides: [] } : m.answer;
  },
  tryCallTool: async () => ({ guides: [] }),
}));
vi.mock('@cs/tools', () => ({ sourceLabel: (s: string) => (s === 'web' ? 'Website' : s), changeTypeOptions: () => [{ id: 'new_service', label: 'New service' }] }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('./actions', () => ({ resolveReviewAction: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/platform/reviews', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const { default: Reviews } = await import('./page');

const item = {
  id: 'r1', createdAt: new Date().toISOString(), competitorName: 'Smith HVAC', source: 'web', kind: 'modified', beforeText: 'a', afterText: 'b',
  questions: [],
};
const show = async (sp: Record<string, string> = {}) =>
  render(<HelpProvider value={{ audience: 'operator', names: { agency: 'your agency', assistant: 'Sunny' } }}>{await Reviews({ searchParams: Promise.resolve(sp) })}</HelpProvider>);

beforeEach(() => { m.calls = []; m.answer = { items: [item], nextCursor: 'NEXT', prevCursor: 'PREV', total: 60 }; });
afterEach(cleanup);

describe('platform reviews page', () => {
  it('shows the count, a card header with labels and age, and Previous/Next with ?cursor=', async () => {
    await show({ cursor: 'CUR' });
    expect(screen.getByText('Waiting for review (60)')).toBeTruthy();
    expect(screen.getByText('Smith HVAC · Website · Modified · just now')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Previous/ }).getAttribute('href')).toBe('/platform/reviews?cursor=PREV');
    expect(screen.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe('/platform/reviews?cursor=NEXT');
    expect(m.calls.find(([n]) => n === 'list_decision_reviews')![1]).toEqual({ cursor: 'CUR' });
  });
});
