// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';
import { SendingPanel, type SendingDomain } from './sending-panel';

const FALLBACK_FROM = 'brightline@mail.clients.example';
const sending = (o: Partial<NonNullable<SendingDomain>> = {}): SendingDomain => ({
  domain: 'brightline.co', localPart: 'briefs', status: 'pending',
  dkim: { host: '20261114pm._domainkey.brightline.co', value: 'k=rsa;p=MIGf' },
  returnPath: { host: 'pm-bounces.brightline.co', value: 'pm.mtasv.net' },
  dmarcOk: null, error: null, ...o,
});
const save = vi.fn();
const remove = vi.fn();
const panel = (s: SendingDomain, fromAddress = FALLBACK_FROM, readOnly = false) =>
  render(
    <ReadOnlyProvider readOnly={readOnly}>
      <SendingPanel fromAddress={fromAddress} sending={s} save={save} remove={remove} />
    </ReadOnlyProvider>,
  );
const DMARC = 'Add a DMARC record for brightline.co so inboxes trust these emails.';

beforeEach(() => {
  save.mockReset().mockResolvedValue({ ok: true });
  remove.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe('SendingPanel', () => {
  it('none: Email domain and Address name fields, the current From line', async () => {
    panel(null);
    expect(screen.getByRole('heading', { name: 'Email sending' })).toBeTruthy();
    expect(screen.getByText(/Client emails come from/).textContent).toBe(`Client emails come from ${FALLBACK_FROM}.`);
    fireEvent.change(screen.getByLabelText('Email domain'), { target: { value: 'brightline.co' } });
    const local = screen.getByLabelText('Address name') as HTMLInputElement;
    expect(local.value).toBe('briefs');
    fireEvent.change(local, { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const fd = save.mock.calls[0]![1] as FormData;
    expect([fd.get('domain'), fd.get('localPart')]).toEqual(['brightline.co', 'hello']);
  });

  it('a refusal shows its copy in the result line and keeps both values', async () => {
    save.mockResolvedValue({ ok: false, error: 'Use lower-case letters, digits, dots, hyphens or underscores.' });
    panel(null);
    fireEvent.change(screen.getByLabelText('Email domain'), { target: { value: 'brightline.co' } });
    fireEvent.change(screen.getByLabelText('Address name'), { target: { value: 'Hi There' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Use lower-case letters, digits, dots, hyphens or underscores.')).toBeTruthy();
    expect((screen.getByLabelText('Email domain') as HTMLInputElement).value).toBe('brightline.co');
    expect((screen.getByLabelText('Address name') as HTMLInputElement).value).toBe('Hi There');
  });

  it('pending: DKIM and Return-Path records with copy buttons and the chip; From stays the fallback', () => {
    panel(sending());
    expect(screen.getByText('Waiting for DNS')).toBeTruthy();
    const dkim = screen.getByRole('row', { name: /_domainkey/ });
    expect(within(dkim).getByText('TXT')).toBeTruthy();
    expect(within(dkim).getByRole('button', { name: 'Copy TXT value' })).toBeTruthy();
    const rp = screen.getByRole('row', { name: /pm-bounces/ });
    expect(within(rp).getByText('CNAME')).toBeTruthy();
    expect(within(rp).getByText('pm.mtasv.net')).toBeTruthy();
    expect(screen.getByText(/Client emails come from/).textContent).toBe(`Client emails come from ${FALLBACK_FROM}.`);
  });

  it('sending panel shows DMARC warning only when verified and not ok', () => {
    for (const [s, shown] of [
      [sending({ status: 'verified', dmarcOk: false }), true],
      [sending({ status: 'verified', dmarcOk: true }), false],
      [sending({ status: 'verified', dmarcOk: null }), false],
      [sending({ status: 'pending', dmarcOk: false }), false],
      [sending({ status: 'failed', dmarcOk: false, error: 'x' }), false],
    ] as const) {
      panel(s, 'briefs@brightline.co');
      expect(screen.queryByText(DMARC) !== null, `${s!.status}/${String(s!.dmarcOk)}`).toBe(shown);
      cleanup();
    }
  });

  it('verified: Verified chip, the From line shows the domain address, Remove asks first', async () => {
    panel(sending({ status: 'verified', dmarcOk: true }), 'briefs@brightline.co');
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText(/Client emails come from/).textContent).toBe('Client emails come from briefs@brightline.co.');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });

  it('failed: the error and Remove and try again', async () => {
    panel(sending({ status: 'failed', error: "We couldn't verify this domain within 72 hours." }));
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText("We couldn't verify this domain within 72 hours.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove and try again' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });

  it('read-only: no write controls', () => {
    panel(null, FALLBACK_FROM, true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByText(/Client emails come from/)).toBeTruthy();
  });
});
