// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ createInviteLinkAction: vi.fn(), noop: vi.fn(async () => ({ ok: true })) }));
vi.mock('./actions', () => ({
  createPlanVersionAction: m.noop,
  createDiscountCodeAction: m.noop,
  revokeDiscountCodeAction: m.noop,
  createInviteLinkAction: (...a: unknown[]) => m.createInviteLinkAction(...a),
  revokeInviteLinkAction: m.noop,
  setConnectFeeAction: m.noop,
}));
import type { CodeRow } from './codes';
import type { LinkRow } from './invite-links';
import type { PlanRow } from './plan-editor';
const { PlanEditor } = await import('./plan-editor');
const { Codes } = await import('./codes');
const { InviteLinks } = await import('./invite-links');
const { ConnectPanel } = await import('./connect-panel');

const plan = (over: Partial<PlanRow> = {}): PlanRow => ({
  id: 'p2', version: 2, name: 'Standard', basePriceCents: 29900, includedSeats: 3, seatPriceCents: 4900, trialDays: 30,
  isCurrent: true, synced: true, createdAt: '2026-10-01T00:00:00Z', ...over,
});
const code = (over: Partial<CodeRow> = {}): CodeRow => ({
  id: 'd1', code: 'FRIEND', percentOff: 20, amountOffCents: null, appliesTo: 'both', duration: 'once', durationMonths: null,
  restrictedAgencyIds: null, expiresAt: null, maxRedemptions: null, revokedAt: null, ...over,
});
const link = (over: Partial<LinkRow> = {}): LinkRow => ({
  id: 'l1', tokenPrefix: 'abc123', offer: 'pilot', pilotEndsAt: '2026-12-01T00:00:00Z', maxUses: 3, uses: 1,
  expiresAt: '2026-11-01T00:00:00Z', note: 'For Acme', revokedAt: null, ...over,
});

beforeEach(() => m.createInviteLinkAction.mockReset());
afterEach(cleanup);

describe('PlanEditor', () => {
  it('owner gets the new-version form', () => {
    render(<PlanEditor plans={[plan()]} canEdit />);
    expect(screen.getByRole('button', { name: 'Publish new version' })).toBeTruthy();
    expect(screen.getByLabelText('Base price ($/month)')).toBeTruthy();
  });

  it.each([false])('staff/viewer (canEdit=%s) see the read-only table only', (canEdit) => {
    render(<PlanEditor plans={[plan(), plan({ id: 'p1', version: 1, isCurrent: false })]} canEdit={canEdit} />);
    expect(screen.queryByRole('button', { name: 'Publish new version' })).toBeNull();
    expect(screen.getAllByText('$299.00')).toHaveLength(2);
    expect(screen.getByText('Current')).toBeTruthy();
  });
});

describe('Codes', () => {
  it('owner sees create form and Revoke; says restricted codes have no promotion code', () => {
    render(<Codes codes={[code()]} canManage />);
    expect(screen.getByRole('button', { name: 'Create code' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
    expect(screen.getByText(/Restricted codes have no promotion code/)).toBeTruthy();
    expect(screen.getByText('20% off')).toBeTruthy();
  });

  it('viewer/staff see the list without create or revoke', () => {
    render(<Codes codes={[code(), code({ id: 'd2', code: 'OLD', revokedAt: '2026-10-02T00:00:00Z' })]} canManage={false} />);
    expect(screen.getByText('FRIEND')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create code' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
    expect(screen.getByText('Revoked')).toBeTruthy();
  });
});

describe('InviteLinks', () => {
  it('lists prefix, offer, uses/max, expiry, note and a Revoke button; never a full URL', () => {
    render(<InviteLinks links={[link()]} codes={[]} />);
    const row = screen.getByText('abc123…').closest('tr')!;
    expect(within(row).getByText('Pilot')).toBeTruthy();
    expect(within(row).getByText('1 / 3')).toBeTruthy();
    expect(within(row).getByText('2026-11-01')).toBeTruthy();
    expect(within(row).getByText('For Acme')).toBeTruthy();
    expect(within(row).getByText('Active')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Revoke' })).toBeTruthy();
    expect(screen.queryByText(/won't be shown again/)).toBeNull();
  });

  it('shows the new link once, in a copy box with the one-time warning', async () => {
    m.createInviteLinkAction.mockResolvedValue({ ok: true, url: 'https://app.example/join/SECRET-TOKEN' });
    const { unmount } = render(<InviteLinks links={[]} codes={[]} />);
    fireEvent.change(screen.getByLabelText('Offer'), { target: { value: 'trial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(screen.getByText("Copy link — it won't be shown again.")).toBeTruthy());
    expect((screen.getByLabelText('New invite link') as HTMLInputElement).value).toBe('https://app.example/join/SECRET-TOKEN');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    unmount();
    render(<InviteLinks links={[link()]} codes={[]} />);
    expect(screen.queryByText(/SECRET-TOKEN/)).toBeNull();
    expect(screen.queryByLabelText('New invite link')).toBeNull();
  });

  it('shows a refusal from the action', async () => {
    m.createInviteLinkAction.mockResolvedValue({ ok: false, error: 'A pilot offer needs pilotEndsAt' });
    render(<InviteLinks links={[]} codes={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('pilot'));
  });
});

describe('ConnectPanel', () => {
  const overview = {
    globalFeePercent: 2.5,
    agencies: [
      { agencyId: 'a1', name: 'Acme Agency', status: 'connected' as const, chargesEnabled: true, feeOverridePercent: 1, payingClients: 3, paymentNeededClients: 1, clientMrrCents: 29700 },
      { agencyId: 'a2', name: 'Beta Co', status: 'restricted' as const, chargesEnabled: false, feeOverridePercent: null, payingClients: 0, paymentNeededClients: 0, clientMrrCents: 0 },
    ],
    totals: { connectedAgencies: 1, payingClients: 3, clientMrrCents: 29700 },
  };
  it('viewer sees the overview, totals and fees, but no fee forms', () => {
    render(<ConnectPanel overview={overview} canEdit={false} />);
    expect(screen.getByText('Acme Agency')).toBeTruthy();
    expect(screen.getByText('Beta Co')).toBeTruthy();
    expect(screen.getAllByText('$297.00').length).toBeGreaterThan(0);
    expect(screen.getByText('2.5%')).toBeTruthy(); // platform default
    expect(screen.getByText('1%')).toBeTruthy(); // Acme override
    expect(screen.getByText('Restricted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
  it('owner gets the default and per-agency fee forms', () => {
    render(<ConnectPanel overview={overview} canEdit />);
    expect(screen.getByRole('button', { name: 'Save default fee' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save agency fee' })).toBeTruthy();
    expect(screen.getByLabelText('Agency')).toBeTruthy();
  });
  it('says so when no agency has connected', () => {
    render(<ConnectPanel overview={{ ...overview, agencies: [], totals: { connectedAgencies: 0, payingClients: 0, clientMrrCents: 0 } }} canEdit={false} />);
    expect(screen.getByText(/No agency has connected Stripe yet/)).toBeTruthy();
  });
});
