// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';
import { DomainPanel, type CustomDomain } from './domain-panel';

const FALLBACK = 'brightline.clients.example';
const RECORDS = [{ type: 'CNAME', name: 'intel', value: 'cname.vercel-dns.example' }];
const custom = (o: Partial<NonNullable<CustomDomain>> = {}): CustomDomain => ({
  hostname: 'intel.brightline.co', status: 'pending', dnsRecords: RECORDS, error: null, liveAt: null, ...o,
});
const save = vi.fn();
const remove = vi.fn();
const panel = (c: CustomDomain, liveDate: string | null = null, readOnly = false) =>
  render(
    <ReadOnlyProvider readOnly={readOnly}>
      <DomainPanel fallbackHost={FALLBACK} custom={c} liveDate={liveDate} save={save} remove={remove} />
    </ReadOnlyProvider>,
  );

beforeEach(() => {
  save.mockReset().mockResolvedValue({ ok: true });
  remove.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe('DomainPanel', () => {
  it("renders each custom-domain state's copy and records", () => {
    // none: a Domain field and Save; the fallback line
    panel(null);
    expect(screen.getByRole('heading', { name: 'Web address' })).toBeTruthy();
    expect(screen.getByLabelText('Domain')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByText(/Until then, clients use/).textContent).toBe(`Until then, clients use ${FALLBACK}.`);
    cleanup();

    // pending: DNS table with a copy button per value, the chip and the CNAME help line
    panel(custom());
    expect(screen.getByText('Waiting for DNS')).toBeTruthy();
    expect(screen.getByText('Add a CNAME record at your DNS provider. We check every 10 minutes for up to 72 hours.')).toBeTruthy();
    for (const h of ['Type', 'Name', 'Value']) expect(screen.getByRole('columnheader', { name: h })).toBeTruthy();
    const row = screen.getByRole('row', { name: /cname\.vercel-dns\.example/ });
    expect(within(row).getByText('CNAME')).toBeTruthy();
    expect(within(row).getByText('intel')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Copy CNAME value' })).toBeTruthy();
    expect(screen.queryByLabelText('Domain')).toBeNull();
    expect(screen.getByText(/Until then, clients use/)).toBeTruthy();
    cleanup();

    // verifying
    panel(custom({ status: 'verifying' }));
    expect(screen.getByText('Checking certificate')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeTruthy();
    cleanup();

    // live: hostname + live date, no records, no fallback line
    panel(custom({ status: 'live', liveAt: '2026-11-10T12:00:00.000Z' }), 'Nov 10');
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('intel.brightline.co')).toBeTruthy();
    expect(screen.getByText(/Nov 10/)).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Value' })).toBeNull();
    expect(screen.queryByText(/Until then, clients use/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    cleanup();

    // failed: the error and "Remove and try again"
    panel(custom({ status: 'failed', error: "We couldn't verify this domain within 72 hours." }));
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText("We couldn't verify this domain within 72 hours.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove and try again' })).toBeTruthy();
    expect(screen.getByText(/Until then, clients use/)).toBeTruthy();
  });

  it('remove confirm shows the warning and posts through the remove action', async () => {
    panel(custom({ status: 'live' }), 'Nov 10');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Links in emails already sent to clients will stop working.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });

  it('Remove and try again calls remove without a confirm; a refusal stays in the always-mounted result line', async () => {
    remove.mockResolvedValue({ ok: false, error: "We couldn't reach the domain service. Please try again in a few minutes." });
    panel(custom({ status: 'failed', error: 'x' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove and try again' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("We couldn't reach the domain service. Please try again in a few minutes.")).toBeTruthy();
  });

  it('Save posts the controlled hostname; a refusal shows its copy and keeps the typed value', async () => {
    save.mockResolvedValue({ ok: false, error: 'Use a subdomain such as intel.youragency.com.' });
    panel(null);
    const field = screen.getByLabelText('Domain') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'brightline.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect((save.mock.calls[0]![1] as FormData).get('hostname')).toBe('brightline.co');
    expect(await screen.findByText('Use a subdomain such as intel.youragency.com.')).toBeTruthy();
    expect((screen.getByLabelText('Domain') as HTMLInputElement).value).toBe('brightline.co');
  });

  it('a read-only support session sees the state but no write controls', () => {
    panel(null, null, true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    cleanup();
    panel(custom({ status: 'failed', error: 'x' }), null, true);
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(screen.getByText('Failed')).toBeTruthy();
  });
});
