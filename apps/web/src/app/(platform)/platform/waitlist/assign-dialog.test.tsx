// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ find: vi.fn(), assign: vi.fn() }));
vi.mock('./actions', () => ({ findPlacesAction: m.find, assignBusinessAction: m.assign }));
const { AssignDialog } = await import('./assign-dialog');

const place = (i: number, over: Record<string, unknown> = {}) => ({
  placeId: `p${i}`, cid: null, title: `Smith Dental ${i}`, address: `${i} Main St`, city: 'Austin', category: 'Dentist', phone: null, domain: null, rating: 4.5, votes: 10, lat: 30.2, lng: -97.7,
  possibleDuplicate: false, suggestedVerticalId: 'dental', ...over,
});
const agencies = [{ id: 'ag-a', name: 'Acme' }, { id: 'ag-b', name: 'Beta' }];

beforeEach(() => {
  m.find.mockReset().mockResolvedValue({ ok: true, places: [place(1), place(2, { possibleDuplicate: true })] });
  m.assign.mockReset().mockResolvedValue({ ok: true, message: 'Assigned.' });
});
afterEach(cleanup);

const open = (onResult = vi.fn(), homeAgencyId: string | null = 'ag-b') => {
  render(<AssignDialog entryId="w1" orgName="Smith Dental" location="Austin, TX" agencies={agencies} homeAgencyId={homeAgencyId} onResult={onResult} />);
  fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
  return onResult;
};

describe('AssignDialog', () => {
  it('assign dialog posts the picked place and agency', async () => {
    const onResult = open();
    expect(screen.getByText('Assign Smith Dental to an agency')).toBeTruthy();
    expect(screen.getByText("Find the business's Google listing, then pick the agency. The agency is emailed and sees it under Leads.")).toBeTruthy();
    expect((screen.getByLabelText('Business name') as HTMLInputElement).value).toBe('Smith Dental');
    expect((screen.getByLabelText('City or ZIP') as HTMLInputElement).value).toBe('Austin, TX');
    expect((screen.getByLabelText('Agency') as HTMLSelectElement).value).toBe('ag-b'); // the operator's home agency
    const confirm = () => screen.getAllByRole('button', { name: 'Assign' }).at(-1) as HTMLButtonElement;
    expect(confirm().disabled).toBe(true); // no listing picked yet

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2));
    expect(m.find).toHaveBeenCalledWith({ name: 'Smith Dental', location: 'Austin, TX' });
    expect(screen.getByText('Possible duplicate')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.change(screen.getByLabelText('Agency'), { target: { value: 'ag-a' } });
    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(confirm());

    await waitFor(() => expect(m.assign).toHaveBeenCalledTimes(1));
    const fd = m.assign.mock.calls[0]![1] as FormData;
    expect([fd.get('id'), fd.get('agencyId')]).toEqual(['w1', 'ag-a']);
    const lookup = JSON.parse(String(fd.get('lookup')));
    expect(lookup.placeId).toBe('p1');
    expect(lookup).not.toHaveProperty('possibleDuplicate');
    expect(lookup).not.toHaveProperty('suggestedVerticalId');
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ ok: true, message: 'Assigned to Acme.' }));
  });

  it('keeps the dialog open and shows the refusal', async () => {
    m.assign.mockResolvedValue({ ok: false, error: 'This agency already has this lead.' });
    const onResult = open();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    await waitFor(() => expect((screen.getAllByRole('button', { name: 'Assign' }).at(-1) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' }).at(-1)!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('This agency already has this lead.'));
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByText('Assign Smith Dental to an agency')).toBeTruthy();
  });

  it('starts with no agency chosen when the home agency is not in the list', () => {
    open(vi.fn(), 'elsewhere');
    expect((screen.getByLabelText('Agency') as HTMLSelectElement).value).toBe('');
  });
});
