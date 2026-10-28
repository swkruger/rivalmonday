// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ createInviteLinkAction: vi.fn(), createPlanVersionAction: vi.fn(async () => ({ ok: true })), revokeDiscountCodeAction: vi.fn(async () => ({ ok: true })), noop: vi.fn(async () => ({ ok: true })) }));
vi.mock('./actions', () => ({
  createPlanVersionAction: (...a: unknown[]) => (m.createPlanVersionAction as (...x: unknown[]) => unknown)(...a),
  createDiscountCodeAction: m.noop,
  revokeDiscountCodeAction: (...a: unknown[]) => (m.revokeDiscountCodeAction as (...x: unknown[]) => unknown)(...a),
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
  id: 'p2', version: 2, name: 'Standard', basePriceCents: 29900, includedSeats: 3, seatPriceCents: 4900, trialDays: 30, features: ['ask', 'mcp'],
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

beforeEach(() => {
  m.createInviteLinkAction.mockReset();
  m.createPlanVersionAction.mockClear();
  m.revokeDiscountCodeAction.mockClear();
});
afterEach(cleanup);

describe('PlanEditor', () => {
  it('owner gets the new-version form', () => {
    render(<PlanEditor plans={[plan()]} canEdit tz="UTC" />);
    expect(screen.getByRole('button', { name: 'Publish new version' })).toBeTruthy();
    expect(screen.getByLabelText('Base price ($/month)')).toBeTruthy();
  });

  it.each([false])('billing amounts render $299 not $299.00; staff/viewer (canEdit=%s) see the read-only table only', (canEdit) => {
    render(<PlanEditor plans={[plan(), plan({ id: 'p1', version: 1, isCurrent: false })]} canEdit={canEdit} tz="UTC" />);
    expect(screen.queryByRole('button', { name: 'Publish new version' })).toBeNull();
    expect(screen.getAllByText('$299')).toHaveLength(2);
    expect(screen.getByText('Current')).toBeTruthy();
  });
});

describe('PlanEditor confirms and dates', () => {
  it('publish plan needs a confirm: click opens the dialog, confirming calls the action once with the form values', async () => {
    render(<PlanEditor plans={[]} canEdit tz="UTC" />);
    fireEvent.change(screen.getByLabelText('Base price ($/month)'), { target: { value: '299' } });
    // ConfirmForm: with required fields still empty the dialog does not open.
    fireEvent.click(screen.getByRole('button', { name: 'Publish new version' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.change(screen.getByLabelText('Included seats'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Extra seat ($/month)'), { target: { value: '99' } });
    fireEvent.change(screen.getByLabelText('Trial days'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish new version' }));
    expect(m.createPlanVersionAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Publish a new plan version?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish version' }));
    await waitFor(() => expect(m.createPlanVersionAction).toHaveBeenCalledTimes(1));
    const fd = (m.createPlanVersionAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(fd.get('basePrice')).toBe('299');
    expect(fd.get('name')).toBe('Standard');
  });

  it('versions table lists the features of each version, or None', () => {
    render(<PlanEditor plans={[plan(), plan({ id: 'p1', version: 1, isCurrent: false, features: [] })]} canEdit={false} tz="UTC" />);
    expect(screen.getByText('Ask, MCP access')).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();
  });

  it('the publish form has Ask and MCP access checkboxes, preset from the current version, and posts the ticked ones', async () => {
    render(<PlanEditor plans={[plan({ features: ['ask'] })]} canEdit tz="UTC" />);
    const ask = screen.getByLabelText('Ask') as HTMLInputElement;
    const mcp = screen.getByLabelText('MCP access') as HTMLInputElement;
    expect([ask.checked, mcp.checked]).toEqual([true, false]);
    fireEvent.click(mcp);
    fireEvent.change(screen.getByLabelText('Base price ($/month)'), { target: { value: '299' } });
    fireEvent.change(screen.getByLabelText('Included seats'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Extra seat ($/month)'), { target: { value: '99' } });
    fireEvent.change(screen.getByLabelText('Trial days'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish new version' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish version' }));
    await waitFor(() => expect(m.createPlanVersionAction).toHaveBeenCalledTimes(1));
    const fd = (m.createPlanVersionAction.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(fd.getAll('features')).toEqual(['ask', 'mcp']);
  });

  it('plan created date is not ISO', () => {
    render(<PlanEditor plans={[plan({ createdAt: '2025-10-01T12:00:00Z' })]} canEdit={false} tz="America/Chicago" />);
    expect(screen.getByText('Oct 1, 2025')).toBeTruthy();
    expect(screen.queryByText(/2025-10-01/)).toBeNull();
  });
});

describe('Codes', () => {
  it('owner sees create form and Revoke; says restricted codes have no promotion code', () => {
    render(<Codes codes={[code()]} canManage tz="UTC" />);
    expect(screen.getByRole('button', { name: 'Create code' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
    expect(screen.getByText(/Restricted codes have no promotion code/)).toBeTruthy();
    expect(screen.getByText('20% off')).toBeTruthy();
  });

  it('revoking a code asks first, then calls the action once with the id', async () => {
    render(<Codes codes={[code()]} canManage tz="UTC" />);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(m.revokeDiscountCodeAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Revoke this discount code?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke code' }));
    await waitFor(() => expect(m.revokeDiscountCodeAction).toHaveBeenCalledTimes(1));
    expect(((m.revokeDiscountCodeAction.mock.calls[0] as unknown as [unknown, FormData])[1]).get('id')).toBe('d1');
  });

  it('shows the expiry as a short date, not ISO', () => {
    render(<Codes codes={[code({ expiresAt: '2099-03-05T23:59:59Z' })]} canManage={false} tz="UTC" />);
    expect(screen.getByText('Mar 5, 2099')).toBeTruthy();
  });

  it('viewer/staff see the list without create or revoke', () => {
    render(<Codes codes={[code(), code({ id: 'd2', code: 'OLD', revokedAt: '2026-10-02T00:00:00Z' })]} canManage={false} tz="UTC" />);
    expect(screen.getByText('FRIEND')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create code' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
    expect(screen.getByText('Revoked')).toBeTruthy();
  });
});

describe('InviteLinks', () => {
  it('lists prefix, offer, uses/max, expiry, note and a Revoke button; never a full URL', () => {
    render(<InviteLinks links={[link()]} codes={[]} tz="UTC" />);
    const row = screen.getByText('abc123…').closest('tr')!;
    expect(within(row).getByText('Pilot')).toBeTruthy();
    expect(within(row).getByText('1 / 3')).toBeTruthy();
    expect(within(row).getByText('Nov 1')).toBeTruthy();
    expect(within(row).getByText('For Acme')).toBeTruthy();
    expect(within(row).getByText('Active')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Revoke' })).toBeTruthy();
    expect(screen.queryByText(/won't be shown again/)).toBeNull();
  });

  it('shows the new link once, in a copy box with the one-time warning', async () => {
    m.createInviteLinkAction.mockResolvedValue({ ok: true, url: 'https://app.example/join/SECRET-TOKEN' });
    const { unmount } = render(<InviteLinks links={[]} codes={[]} tz="UTC" />);
    fireEvent.change(screen.getByLabelText('Offer'), { target: { value: 'trial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(screen.getByText("Copy link — it won't be shown again.")).toBeTruthy());
    expect((screen.getByLabelText('New invite link') as HTMLInputElement).value).toBe('https://app.example/join/SECRET-TOKEN');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    unmount();
    render(<InviteLinks links={[link()]} codes={[]} tz="UTC" />);
    expect(screen.queryByText(/SECRET-TOKEN/)).toBeNull();
    expect(screen.queryByLabelText('New invite link')).toBeNull();
  });

  describe('pilot date hint', () => {
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const setDates = (pilot: string, days: string) => {
      fireEvent.change(screen.getByLabelText('Pilot ends'), { target: { value: pilot } });
      fireEvent.change(screen.getByLabelText('Expires in (days)'), { target: { value: days } });
    };

    it('shows a live hint when the pilot ends before the link expires', () => {
      render(<InviteLinks links={[]} codes={[]} tz="UTC" />);
      setDates(day(3), '14');
      expect(screen.getByRole('status').textContent).toContain('The pilot must end after this link expires');
    });

    it('shows none for valid dates', () => {
      render(<InviteLinks links={[]} codes={[]} tz="UTC" />);
      setDates(day(30), '14');
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('treats blank days as the 14-day default', () => {
      render(<InviteLinks links={[]} codes={[]} tz="UTC" />);
      setDates(day(3), '');
      expect(screen.getByRole('status').textContent).toContain('The pilot must end after this link expires');
    });

    it('hides the live hint while the server refusal shows the same sentence', async () => {
      render(<InviteLinks links={[]} codes={[]} tz="UTC" />);
      setDates(day(3), '14');
      const hint = screen.getByRole('status').textContent ?? '';
      m.createInviteLinkAction.mockResolvedValue({ ok: false, error: hint });
      fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(hint));
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('is hidden for a trial offer', () => {
      render(<InviteLinks links={[]} codes={[]} tz="UTC" />);
      setDates(day(3), '14');
      fireEvent.change(screen.getByLabelText('Offer'), { target: { value: 'trial' } });
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  it('shows a refusal from the action', async () => {
    m.createInviteLinkAction.mockResolvedValue({ ok: false, error: 'A pilot offer needs pilotEndsAt' });
    render(<InviteLinks links={[]} codes={[]} tz="UTC" />);
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
    expect(screen.getAllByText('$297').length).toBeGreaterThan(0);
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
  it('totals render as a KPI strip, read by [data-slot="kpi"]', () => {
    const { container } = render(<ConnectPanel overview={overview} canEdit={false} />);
    const cells = [...container.querySelectorAll('[data-slot="kpi"]')].map((k) => k.textContent);
    expect(cells).toHaveLength(4);
    expect(cells[0]).toContain('Connected agencies');
    expect(cells[0]).toContain('1');
    expect(cells[2]).toContain('Client MRR via Connect');
    expect(cells[2]).toContain('$297');
    expect(cells[3]).toContain('2.5%');
  });
  it('says so when no agency has connected', () => {
    render(<ConnectPanel overview={{ ...overview, agencies: [], totals: { connectedAgencies: 0, payingClients: 0, clientMrrCents: 0 } }} canEdit={false} />);
    expect(screen.getByText(/No agency has connected Stripe yet/)).toBeTruthy();
  });
});
