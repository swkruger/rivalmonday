// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ find: vi.fn(), approve: vi.fn(), push: vi.fn() }));
vi.mock('./actions', () => ({ findPlacesAction: m.find, approveSampleAction: m.approve }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push, replace: vi.fn(), refresh: vi.fn() }) }));
const { SampleDialog } = await import('./sample-dialog');

const place = (i: number, over: Record<string, unknown> = {}) => ({
  placeId: `p${i}`, cid: null, title: `Smith Dental ${i}`, address: `${i} Main St`, city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 30.2, lng: -97.7,
  possibleDuplicate: false, suggestedVerticalId: 'dental', ...over,
});
const verticals = [{ id: 'hvac_plumbing', name: 'HVAC & plumbing' }, { id: 'dental', name: 'Dental' }];

beforeEach(() => {
  m.find.mockReset().mockResolvedValue({ ok: true, places: [place(1), place(2, { suggestedVerticalId: null })] });
  m.approve.mockReset().mockResolvedValue({ ok: true, setupUrl: '/c/c-1/setup' });
  m.push.mockReset();
});
afterEach(cleanup);

const open = () => {
  render(
    <SampleDialog
      entryId="w1" orgName="Cool Air" contactName="Ana" businessName="Smith Dental" location="Austin, TX" website="smith.co"
      estimate="Estimated cost per sample: discovery up to $3.00 + starting point: no history yet" verticals={verticals}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
};
const confirm = () => screen.getByRole('button', { name: 'Approve and open setup' }) as HTMLButtonElement;

describe('SampleDialog', () => {
  it('approve navigates to the setup url', async () => {
    open();
    expect(screen.getByText('Build a sample brief for Smith Dental')).toBeTruthy();
    expect(screen.getByText('This creates the business in the Rival Monday Samples agency and opens its setup. Confirm the area and tick the rivals as usual, then approve the starting point in Approvals. Nothing is emailed to the business.')).toBeTruthy();
    expect(screen.getByText(/Estimated cost per sample: discovery up to \$3\.00/)).toBeTruthy();
    expect(screen.getByText(/Cool Air/)).toBeTruthy();
    expect((screen.getByLabelText('Business name') as HTMLInputElement).value).toBe('Smith Dental');
    expect((screen.getByLabelText('City or ZIP') as HTMLInputElement).value).toBe('Austin, TX');
    expect(confirm().disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    await waitFor(() => expect((screen.getByLabelText('Business type') as HTMLSelectElement).value).toBe('dental')); // preselected from the listing
    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(confirm());

    await waitFor(() => expect(m.approve).toHaveBeenCalledTimes(1));
    const fd = m.approve.mock.calls[0]![1] as FormData;
    expect([fd.get('id'), fd.get('verticalId')]).toEqual(['w1', 'dental']);
    expect(JSON.parse(String(fd.get('lookup')))).toMatchObject({ placeId: 'p1' });
    await waitFor(() => expect(m.push).toHaveBeenCalledWith('/c/c-1/setup'));
  });

  it('a refusal stays in the dialog and nothing navigates', async () => {
    m.approve.mockResolvedValue({ ok: false, error: "This month's sample limit (10) is used up. Raise it on Billing & plans or wait until next month." });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('radio')[1]!); // no suggested type: the operator must choose one
    expect(confirm().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Business type'), { target: { value: 'hvac_plumbing' } });
    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(confirm());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("This month's sample limit (10) is used up."));
    expect(m.push).not.toHaveBeenCalled();
  });
});
