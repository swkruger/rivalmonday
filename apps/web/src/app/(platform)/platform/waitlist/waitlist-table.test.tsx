// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('./actions', () => ({ inviteAgenciesAction: vi.fn(), declineWaitlistEntryAction: vi.fn(), findPlacesAction: vi.fn(), assignBusinessAction: vi.fn(), approveSampleAction: vi.fn(), stopSampleAction: vi.fn(), sendSampleAction: m.send }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
const { WaitlistTable } = await import('./waitlist-table');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'w1', kind: 'agency' as const, status: 'new', contactName: 'Ana', email: 'ana@cool.co', orgName: 'Cool Air', location: null, verticalId: null, verticalOther: null,
  clientCountBand: '6-15', emailConfirmed: true, createdAt: '2026-10-05T12:00:00.000Z', sample: null, ...over,
});
const rows = [
  row(),
  row({ id: 'w2', orgName: 'Unconfirmed Co', emailConfirmed: false }),
  row({ id: 'w3', orgName: 'Invited Co', status: 'invited' }),
];
const show = (canWrite = true, tab: 'agencies' | 'businesses' = 'agencies', r = rows) =>
  render(<WaitlistTable rows={r} tab={tab} tz="UTC" verticals={{}} canWrite={canWrite} />);
afterEach(cleanup);

describe('WaitlistTable invites', () => {
  it('bulk bar only for confirmed new rows', () => {
    show();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByRole('checkbox', { name: 'Select Unconfirmed Co' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select Invited Co' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Cool Air' }));
    const bar = screen.getByRole('toolbar', { name: 'Selected agencies' });
    expect(bar.textContent).toContain('1 selected');
    expect(screen.getByLabelText('Pilot ends')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send pilot invite' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send trial invite' })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Cool Air' }));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('viewers get no checkboxes and no Decline; Decline shows on new rows only', () => {
    show(false);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull();
    cleanup();
    show(true);
    expect(screen.getAllByRole('button', { name: 'Decline' })).toHaveLength(2); // Cool Air and Unconfirmed Co (both status new)
  });
});

describe('WaitlistTable assign', () => {
  const biz = [
    row({ id: 'b1', kind: 'business', orgName: 'Smith Dental', location: 'Austin, TX' }),
    row({ id: 'b2', kind: 'business', orgName: 'Unconfirmed Biz', emailConfirmed: false }),
    row({ id: 'b3', kind: 'business', orgName: 'Done Biz', status: 'assigned' }),
  ];
  const showBiz = (canWrite = true, agencies = [{ id: 'a', name: 'Acme' }]) =>
    render(<WaitlistTable rows={biz} tab="businesses" tz="UTC" verticals={{}} canWrite={canWrite} agencies={agencies} homeAgencyId="a" />);

  it('Assign only on confirmed new business rows, for writers', () => {
    showBiz();
    const assign = screen.getAllByRole('button', { name: 'Assign' });
    expect(assign).toHaveLength(1);
    expect(assign[0]!.closest('tr')!.textContent).toContain('Smith Dental');
    cleanup();
    showBiz(false);
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
    cleanup();
    show(true, 'agencies');
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });
});

describe('WaitlistTable samples', () => {
  const s = (id: string, status: string, stage: string | null, clientId: string | null = null) =>
    row({ id, orgName: `Org ${id}`, sample: { businessName: `Biz ${id}`, location: 'Austin, TX', website: null, status, stage, clientId } });
  const samples = [s('s1', 'requested', null), s('s2', 'approved', 'setup', 'c2'), s('s3', 'approved', 'review', 'c3'), s('s4', 'sent', 'sent', 'c4')];
  const showSamples = (canWrite = true) =>
    render(<WaitlistTable rows={samples} tab="samples" tz="UTC" verticals={{ dental: 'Dental' }} canWrite={canWrite} sampleEstimate="Estimated cost per sample: x" />);
  const rowOf = (name: string) => screen.getByText(`Org ${name}`).closest('tr')!;

  it('Approve and Decline on requested, Stop and the stage link on approved', () => {
    showSamples();
    expect(within(rowOf('s1')).getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(within(rowOf('s1')).getByRole('button', { name: 'Decline' })).toBeTruthy();
    expect(within(rowOf('s2')).getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(within(rowOf('s2')).getByRole('link', { name: 'Open setup' }).getAttribute('href')).toBe('/c/c2/setup');
    expect(within(rowOf('s3')).getByRole('link', { name: 'Review brief' }).getAttribute('href')).toBe('/agency/approvals');
    expect(within(rowOf('s4')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Send again']);
    cleanup();
    showSamples(false);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Send/ })).toBeNull();
  });

  it('Send sample when ready to send (or already marked sent), Send again once sent; the link shows in the result line', async () => {
    const rows = [s('r1', 'approved', 'ready_to_send', 'c1'), s('r2', 'approved', 'sent', 'c2'), s('r3', 'approved', 'review', 'c3'), s('r4', 'sent', 'sent', 'c4')];
    render(<WaitlistTable rows={rows} tab="samples" tz="UTC" verticals={{}} canWrite />);
    expect(within(rowOf('r1')).getByRole('button', { name: 'Send sample' })).toBeTruthy();
    expect(within(rowOf('r2')).getByRole('button', { name: 'Send sample' })).toBeTruthy();
    expect(within(rowOf('r3')).queryByRole('button', { name: /Send/ })).toBeNull();
    expect(within(rowOf('r4')).getByRole('button', { name: 'Send again' })).toBeTruthy();
    m.send.mockResolvedValue({ ok: true, url: 'https://app.test/sample/TOKEN', notice: 'Link created, but the email failed — copy the link below.' });
    fireEvent.click(within(rowOf('r1')).getByRole('button', { name: 'Send sample' }));
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Send' })); });
    await waitFor(() => expect(m.send).toHaveBeenCalled());
    expect((m.send.mock.calls[0]![1] as FormData).get('id')).toBe('r1');
    expect((m.send.mock.calls[0]![1] as FormData).get('orgName')).toBe('Org r1');
    expect(await screen.findByText('Link created, but the email failed — copy the link below.')).toBeTruthy();
    expect(screen.getByText('https://app.test/sample/TOKEN')).toBeTruthy();
  });
});
