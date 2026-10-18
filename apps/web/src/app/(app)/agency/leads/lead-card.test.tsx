// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type LeadView, LeadCard, PLATFORM_NOTE, sourceLabel } from './lead-card';

vi.mock('./actions', () => ({ acceptLeadAction: vi.fn(), declineLeadAction: vi.fn() }));

const verticals = [{ id: 'dental', name: 'Dental', services: [] }, { id: 'hvac', name: 'HVAC & plumbing', services: [] }];
const lead = (over: Partial<LeadView> = {}): LeadView => ({
  id: 'l1', source: 'agency_link', status: 'verified', ref: 'abc', businessName: 'Smith Dental', address: '1 Main St', contactName: 'Sam Smith', email: 'sam@smith.co', phone: '555-1',
  message: 'Hello there', preview: { status: 'ready', facts: ['Ranks 2nd by reviews'], summary: 'A short summary.' }, clientId: null, when: '2026-10-01T00:00:00.000Z', suggestedVerticalId: 'hvac', ...over,
});

describe('LeadCard', () => {
  it('shows business, contact, ref, message, preview and the source label', () => {
    render(<LeadCard lead={lead()} verticals={verticals} />);
    expect(screen.getByText('Smith Dental')).toBeTruthy();
    expect(screen.getByText('From your website')).toBeTruthy();
    expect(screen.getByText('Sam Smith')).toBeTruthy();
    expect(screen.getByText(/Ref abc/)).toBeTruthy();
    expect(screen.getByText('Hello there')).toBeTruthy();
    expect(screen.getByText('Ranks 2nd by reviews')).toBeTruthy();
    expect(sourceLabel('platform')).toBe('From the platform');
  });

  it('accept preselects the suggested vertical and confirms with the contact name', () => {
    render(<LeadCard lead={lead()} verticals={verticals} />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect((screen.getByLabelText('Service type') as HTMLSelectElement).value).toBe('hvac');
    expect(screen.getByRole('button', { name: 'Accept and invite Sam Smith' })).toBeTruthy();
  });

  it('decline of an agency-link lead offers "Let them know", on by default', () => {
    render(<LeadCard lead={lead()} verticals={verticals} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect((screen.getByLabelText('Let them know') as HTMLInputElement).checked).toBe(true);
  });

  it('decline of a platform lead hides the checkbox and says it goes back to the pool', () => {
    render(<LeadCard lead={lead({ source: 'platform' })} verticals={verticals} />);
    expect(screen.getByText('From the platform')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.queryByLabelText('Let them know')).toBeNull();
    expect(screen.getByText(PLATFORM_NOTE)).toBeTruthy();
  });

  it('decided leads have no accept/decline controls', () => {
    render(<LeadCard lead={lead({ status: 'declined' })} verticals={verticals} />);
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});
