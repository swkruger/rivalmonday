// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertLinkList, BriefLinkList } from './client-lists';

const brief = { id: 'b1', clientId: 'c1', deliveryDate: '2026-10-05', status: 'sent', kind: 'weekly', summary: 'Two moves', sentAt: null, hasPdf: false };
const alert = { id: 'a1', clientId: 'c1', competitorName: 'Smith HVAC', headline: 'Cut tune-ups to $59', score: 82, status: 'delivered', createdAt: '2026-10-05T00:00:00.000Z', deliveredAt: null };

describe('BriefLinkList', () => {
  it('links each brief to its page by week', () => {
    render(<BriefLinkList clientId="c1" items={[brief]} empty="No briefs yet." />);
    expect(screen.getByRole('link', { name: /week of 2026-10-05/i }).getAttribute('href')).toBe('/c/c1/briefs/b1');
  });
  it('shows the empty message', () => {
    render(<BriefLinkList clientId="c1" items={[]} empty="No earlier briefs." />);
    expect(screen.getByText('No earlier briefs.')).toBeTruthy();
  });
});

describe('AlertLinkList', () => {
  it('links each alert to its page', () => {
    render(<AlertLinkList clientId="c1" items={[alert]} />);
    expect(screen.getByRole('link', { name: /Smith HVAC — Cut tune-ups/ }).getAttribute('href')).toBe('/c/c1/alerts/a1');
  });
  it('says when there are none', () => {
    render(<AlertLinkList clientId="c1" items={[]} />);
    expect(screen.getByText('No alerts.')).toBeTruthy();
  });
});
