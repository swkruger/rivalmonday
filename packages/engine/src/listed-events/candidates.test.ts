import { describe, expect, it } from 'vitest';
import { jsonLdCandidates, metaCandidates, panelCandidates } from './candidates';

const ld = (o: Partial<Parameters<typeof jsonLdCandidates>[0][number]> = {}) => ({ name: 'Show', startDate: '2026-11-14', endDate: null, status: null, soldOut: false, ticketed: false, url: null, venue: null, ...o });

describe('candidates', () => {
  it('maps panel rows to scheduled google_panel candidates and drops undated ones', () => {
    const c = panelCandidates({ timeZone: 'America/Chicago', events: [{ title: 'Jason Isbell', subtitle: 'Fri, Nov 13, 8:00 PM', url: null }, { title: 'X', subtitle: 'soon', url: null }] }, new Date('2026-11-10T12:00:00Z'));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ source: 'google_panel', startDate: '2026-11-13', status: 'scheduled', ticketed: false, nameNorm: 'jason isbell' });
    expect(c[0]!.startsAt).toBe('2026-11-14T02:00:00.000Z');
  });
  it('JSON-LD EventCancelled + soldOut = cancelled; bare and URL status forms both map', () => {
    expect(jsonLdCandidates([ld({ status: 'https://schema.org/EventCancelled', soldOut: true })])[0]!.status).toBe('cancelled');
    expect(jsonLdCandidates([ld({ status: 'EventPostponed', soldOut: true })])[0]!.status).toBe('postponed');
    expect(jsonLdCandidates([ld({ status: 'EventScheduled', soldOut: true })])[0]!.status).toBe('sold_out');
    expect(jsonLdCandidates([ld()])[0]!.status).toBe('scheduled');
  });
  it('JSON-LD date as written; startsAt only with time and offset; unparseable dropped', () => {
    const c = jsonLdCandidates([ld({ startDate: '2026-11-14T20:00:00-06:00' }), ld({ startDate: '2026-11-14T20:00:00' }), ld({ startDate: 'tomorrow' })]);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ startDate: '2026-11-14', startsAt: '2026-11-15T02:00:00.000Z' });
    expect(c[1]).toMatchObject({ startDate: '2026-11-14', startsAt: null });
  });
  it('Meta 2026-11-14T02:00:00Z is 2026-11-13 in Chicago', () => {
    const c = metaCandidates([{ event: { name: 'Party', startsAt: '2026-11-14T02:00:00Z' } }, { event: null }, { event: { name: 'N', startsAt: null } }]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ source: 'meta_ads', startDate: '2026-11-13', ticketed: false });
  });
});
