// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgencyTable, type AgencyRow } from './agency-table';

const NOW = new Date('2026-10-13T12:00:00.000Z');
const row = (over: Partial<AgencyRow> = {}): AgencyRow => ({
  id: 'a1', name: 'Acme', createdAt: '2026-09-01T00:00:00.000Z', clientsActive: 3, clientsProspect: 2, agencySeats: 2, clientSeats: 4,
  wau: 5, lastActivityAt: '2026-10-12T12:00:00.000Z', spendMonthUsd: 12.5, health: 'steady', ...over,
});

describe('AgencyTable', () => {
  it('renders the empty copy', () => {
    render(<AgencyTable rows={[]} sort="name" dir="asc" now={NOW} />);
    expect(screen.getByText('No agencies yet.')).toBeTruthy();
  });

  it('links each row to its detail page and shows the health pill', () => {
    render(<AgencyTable rows={[row()]} sort="name" dir="asc" now={NOW} />);
    expect(screen.getByRole('link', { name: 'Acme' }).getAttribute('href')).toBe('/platform/agencies/a1');
    expect(screen.getByText('Steady')).toBeTruthy();
    expect(screen.getByText('$12.50')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
  });

  it('renders — for null wau and lastActivityAt', () => {
    render(<AgencyTable rows={[row({ wau: null, lastActivityAt: null })]} sort="name" dir="asc" now={NOW} />);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('sorts by header link: toggles the active column, uses the default direction for others', () => {
    render(<AgencyTable rows={[row()]} sort="name" dir="asc" now={NOW} />);
    expect(screen.getByRole('link', { name: /^Agency/ }).getAttribute('href')).toBe('/platform/agencies?sort=name&dir=desc');
    expect(screen.getByRole('columnheader', { name: /^Agency/ }).getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('link', { name: /^Spend/ }).getAttribute('href')).toBe('/platform/agencies?sort=spend&dir=desc');
    expect(screen.getByRole('link', { name: /^Health/ }).getAttribute('href')).toBe('/platform/agencies?sort=health&dir=asc');
  });
});
