// @vitest-environment jsdom
import type { ChangeLine } from '@cs/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GradedChanges } from './graded-changes';

const C = '00000000-0000-4000-8000-0000000000a1';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let n = 0;
const line = (over: Partial<ChangeLine> = {}): ChangeLine => {
  n += 1;
  return {
    grade: 'notable', topic: 'offers', competitorId: uuid(900), competitorName: 'Smith HVAC', changeType: 'price_change', channel: 'web', count: 1, text: `Smith HVAC change ${n}.`,
    firstAt: '2026-10-06T10:00:00.000Z', lastAt: '2026-10-06T10:00:00.000Z', eventIds: [uuid(n)], evidenceIds: [], ...over,
  };
};
const view = (lines: ChangeLine[], totals = { major: 0, notable: 0, minor: 0 }) => ({ lines, totals });
const HREF = `/c/${C}/changes?route=all&from=2026-10-05&to=2026-10-12`;
afterEach(cleanup);

describe('GradedChanges', () => {
  it('renders topics in order with Major lines before Notable', () => {
    const changes = view(
      [
        line({ topic: 'ads', grade: 'notable', text: 'Ads notable line.' }),
        line({ topic: 'reviews', grade: 'notable', text: 'Reviews notable line.' }),
        line({ topic: 'reviews', grade: 'major', text: 'Reviews major line.' }),
      ],
      { major: 1, notable: 2, minor: 0 },
    );
    render(<GradedChanges clientId={C} changes={changes} timezone="UTC" changesHref={HREF} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Other changes this week' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Reviews & rating', 'Ads']);
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Reviews major line.')).toBeLessThan(text.indexOf('Reviews notable line.'));
    expect(text.indexOf('Reviews notable line.')).toBeLessThan(text.indexOf('Ads notable line.'));
    expect(screen.getByText('Major', { selector: '[data-tone]' }).getAttribute('data-tone')).toBe('neutral');
    expect(screen.getAllByText('Notable', { selector: '[data-tone]' }).length).toBe(2);
    expect(screen.getByText('1 Major · 2 Notable · 0 Minor')).toBeTruthy();
    expect(screen.getAllByText('Oct 6').length).toBe(3);
  });

  it('Minor lines are in a closed details with the count', () => {
    const changes = view([line({ grade: 'notable' }), line({ grade: 'minor', text: 'A minor line.' }), line({ grade: 'minor', text: 'Another minor line.' })], { major: 0, notable: 1, minor: 2 });
    render(<GradedChanges clientId={C} changes={changes} timezone="UTC" changesHref={HREF} />);
    const details = document.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Minor (2)')).toBeTruthy();
    expect(details.textContent).toContain('A minor line.');
    expect(details.textContent).toContain('Another minor line.');
  });

  it('caps a topic at 10 lines and shows +N more', () => {
    const lines = Array.from({ length: 12 }, () => line({ grade: 'notable' }));
    render(<GradedChanges clientId={C} changes={view(lines, { major: 0, notable: 12, minor: 0 })} timezone="UTC" changesHref={HREF} />);
    expect(screen.getAllByText('Notable', { selector: '[data-tone]' }).length).toBe(10);
    expect(screen.getByText('+2 more')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See all changes this week' }).getAttribute('href')).toBe(HREF);
  });

  it('caps Minor at 20 and shows +N more inside it', () => {
    const lines = Array.from({ length: 22 }, () => line({ grade: 'minor' }));
    render(<GradedChanges clientId={C} changes={view(lines, { major: 0, notable: 0, minor: 22 })} timezone="UTC" changesHref={HREF} />);
    expect(screen.getByText('Minor (22)')).toBeTruthy();
    expect(screen.getByText('+2 more')).toBeTruthy();
  });

  it('hides "See all changes" without the dashboard feature (null href)', () => {
    const lines = Array.from({ length: 12 }, () => line({ grade: 'notable' }));
    render(<GradedChanges clientId={C} changes={view(lines, { major: 0, notable: 12, minor: 0 })} timezone="UTC" changesHref={null} />);
    expect(screen.getByText('+2 more')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'See all changes this week' })).toBeNull();
  });

  it('no link and no overflow text when nothing overflows', () => {
    render(<GradedChanges clientId={C} changes={view([line()], { major: 0, notable: 1, minor: 0 })} timezone="UTC" changesHref={HREF} />);
    expect(screen.queryByRole('link', { name: 'See all changes this week' })).toBeNull();
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('nothing when changes is null or empty', () => {
    const a = render(<GradedChanges clientId={C} changes={null} timezone="UTC" changesHref={HREF} />);
    expect(a.container.innerHTML).toBe('');
    a.unmount();
    const b = render(<GradedChanges clientId={C} changes={view([])} timezone="UTC" changesHref={HREF} />);
    expect(b.container.innerHTML).toBe('');
  });

  it('no score text in the output', () => {
    render(<GradedChanges clientId={C} changes={view([line({ grade: 'major' }), line({ grade: 'minor' })], { major: 1, notable: 0, minor: 1 })} timezone="UTC" changesHref={HREF} />);
    expect(document.body.textContent).not.toMatch(/score|threshold/i);
  });

  it('evidence chips use the line evidence ids', () => {
    render(<GradedChanges clientId={C} changes={view([line({ evidenceIds: ['e1'] })], { major: 0, notable: 1, minor: 0 })} timezone="UTC" changesHref={null} />);
    expect(screen.getByRole('link', { name: 'Evidence 1' }).getAttribute('href')).toBe(`/c/${C}/evidence/e1`);
  });
});
