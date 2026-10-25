// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ move: vi.fn() }));
vi.mock('./actions', () => ({ moveAgenciesToCurrentPlanAction: (...a: unknown[]) => m.move(...a) }));
const { PlanAgencies } = await import('./plan-agencies');

const row = (over: Record<string, unknown> = {}) => ({
  agencyId: 'a1', name: 'Alpha', state: 'active', version: 1, onHold: false, seatWarning: null, extraSeatsAfter: 0,
  monthlyNowCents: 29900, monthlyAfterCents: 34900, ...over,
});
const data = (agencies: unknown[]) => ({ currentVersion: 3, agencies }) as never;
const rows = [
  row(),
  row({ agencyId: 'a2', name: 'Bravo', version: null, state: 'pilot', seatWarning: 'over_cap' }),
  row({ agencyId: 'a3', name: 'Charlie', state: 'active', seatWarning: 'extra_seats', extraSeatsAfter: 2 }),
  row({ agencyId: 'a4', name: 'Delta', onHold: true }),
];
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

beforeEach(() => m.move.mockReset());
afterEach(cleanup);

describe('PlanAgencies', () => {
  it('renders rows with version, state and monthly now to after', () => {
    render(<PlanAgencies data={data(rows)} canMove />);
    const alpha = screen.getByText('Alpha').closest('tr')!;
    expect(within(alpha).getByText('v1')).toBeTruthy();
    expect(within(alpha).getByText('Active')).toBeTruthy();
    expect(within(alpha).getByText('$299 → $349')).toBeTruthy();
    expect(within(screen.getByText('Bravo').closest('tr')!).getByText('Not set')).toBeTruthy();
  });

  it('empty state', () => {
    render(<PlanAgencies data={data([])} canMove />);
    expect(screen.getByText('Every agency is on the current version.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Move selected/ })).toBeNull();
  });

  it('a held row is disabled with the hold chip; select-all skips it', () => {
    render(<PlanAgencies data={data(rows)} canMove />);
    expect(box('Select Delta').disabled).toBe(true);
    expect(within(screen.getByText('Delta').closest('tr')!).getByText('On hold')).toBeTruthy();
    fireEvent.click(box('Select all agencies'));
    expect([box('Select Alpha').checked, box('Select Bravo').checked, box('Select Charlie').checked, box('Select Delta').checked]).toEqual([true, true, true, false]);
    fireEvent.click(box('Select all agencies'));
    expect(box('Select Alpha').checked).toBe(false);
  });

  it('a viewer sees the table read-only: no checkboxes, no move button', () => {
    render(<PlanAgencies data={data(rows)} canMove={false} />);
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the move button needs a selection and names the current version', () => {
    render(<PlanAgencies data={data(rows)} canMove />);
    const btn = screen.getByRole('button', { name: 'Move selected to v3' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(box('Select Alpha'));
    expect(btn.disabled).toBe(false);
  });

  it('the dialog lists now to after per agency, both warnings and the note', async () => {
    render(<PlanAgencies data={data(rows)} canMove />);
    for (const n of ['Alpha', 'Bravo', 'Charlie']) fireEvent.click(box(`Select ${n}`));
    fireEvent.click(screen.getByRole('button', { name: 'Move selected to v3' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Alpha').closest('li')!.textContent).toContain('(v1 → v3): $299 → $349');
    expect(within(dialog).getByText('Pays for 2 extra seats from the next billing date.')).toBeTruthy();
    expect(within(dialog).getByText("Over the client limit: new clients can't be activated until they're under it.")).toBeTruthy();
    expect(within(dialog).getByText("New prices start at each agency's next billing date. Feature changes apply now. Admins are emailed.")).toBeTruthy();
  });

  it('confirming moves the chosen ids and summarises, naming those not moved with a reason label', async () => {
    m.move.mockResolvedValue({
      ok: true,
      data: { targetPlanId: 'p3', targetVersion: 3, results: [
        { agencyId: 'a1', outcome: 'moved', emailed: true },
        { agencyId: 'a2', outcome: 'already_current', emailed: false },
        { agencyId: 'a3', outcome: 'failed', reason: 'stripe_error', emailed: false },
      ] },
    });
    render(<PlanAgencies data={data(rows)} canMove />);
    for (const n of ['Alpha', 'Bravo', 'Charlie']) fireEvent.click(box(`Select ${n}`));
    fireEvent.click(screen.getByRole('button', { name: 'Move selected to v3' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move to v3' }));
    await waitFor(() => expect(m.move).toHaveBeenCalledWith(['a1', 'a2', 'a3']));
    expect((await screen.findByRole('status')).textContent).toBe('Moved 1. 1 not moved: Charlie (Stripe error)');
  });

  it('a tool refusal shows as an error', async () => {
    m.move.mockResolvedValue({ ok: false, error: 'Not found' });
    render(<PlanAgencies data={data(rows)} canMove />);
    fireEvent.click(box('Select Alpha'));
    fireEvent.click(screen.getByRole('button', { name: 'Move selected to v3' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move to v3' }));
    expect(await screen.findByText('Not found')).toBeTruthy();
  });
});
