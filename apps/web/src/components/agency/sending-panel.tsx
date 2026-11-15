'use client';
import type { AgencyDomainsView } from '@cs/tools';
import { Alert, Button, Field, Input, Section, StatusChip } from '@cs/ui';
import { useActionState, useState, useTransition } from 'react';
import { ConfirmForm } from '@/components/confirm-form';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import { labelFor, SENDING_DOMAIN_STATUS } from '@/lib/labels';
import type { FormResult } from '@/server/forms';
import { DnsRecordsTable, type DnsRow, type FormAction, ResultLine } from './domain-panel';

export type SendingDomain = AgencyDomainsView['sending'];

const OK: FormResult = { ok: true };
const DEFAULT_LOCAL_PART = 'briefs';

/** Postmark's records: DKIM is a TXT record, Return-Path a CNAME. Null pairs (not stored yet) are left out. */
function sendingRecords(s: NonNullable<SendingDomain>): DnsRow[] {
  const rows: DnsRow[] = [];
  if (s.dkim) rows.push({ type: 'TXT', name: s.dkim.host, value: s.dkim.value });
  if (s.returnPath) rows.push({ type: 'CNAME', name: s.returnPath.host, value: s.returnPath.value });
  return rows;
}

/**
 * 13a1 Domains page, "Email sending": the agency's own sending domain (none → Email domain + Address name; pending → the
 * DKIM / Return-Path records; verified → the chip, plus the DMARC warning when no DMARC record was found (it never blocks);
 * failed → the stored error + "Remove and try again"). The From line is `get_agency_domains.fromAddress`: the address client
 * email uses right now (the fallback until the domain is verified).
 */
export function SendingPanel({ fromAddress, sending, save, remove }: {
  fromAddress: string;
  sending: SendingDomain;
  save: FormAction;
  remove: FormAction;
}) {
  const [domain, setDomain] = useState('');
  const [localPart, setLocalPart] = useState(DEFAULT_LOCAL_PART);
  const [result, setResult] = useState<FormResult>(OK);
  const [, saveAction, saving] = useActionState<FormResult, FormData>(async (prev, fd) => {
    const r = await save(prev, fd);
    setResult(r);
    return r;
  }, OK);
  const [removing, startRemove] = useTransition();
  const status = sending ? labelFor(SENDING_DOMAIN_STATUS, sending.status) : null;
  const records = sending ? sendingRecords(sending) : [];
  const confirmRemove: FormAction = async (prev, fd) => {
    setResult(await remove(prev, fd));
    return OK;
  };

  return (
    <Section ruled title="Email sending">
      <div className="flex max-w-3xl flex-col gap-4">
        <p className="text-13 text-muted-ink">Client emails come from <span className="font-medium text-ink">{fromAddress}</span>.</p>
        {!sending ? (
          <WriteGuard>
            <form action={saveAction} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-2">
              <Field label="Email domain" className="w-64 max-w-full">
                <Input name="domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="youragency.com" maxLength={253} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="Address name" className="w-48 max-w-full">
                <Input name="localPart" value={localPart} onChange={(e) => setLocalPart(e.target.value)} maxLength={40} autoComplete="off" spellCheck={false} />
              </Field>
              <Button type="submit" variant="ink" disabled={saving}>Save</Button>
            </form>
          </WriteGuard>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{sending.domain}</span>
              {status && <StatusChip tone={status.tone}>{status.label}</StatusChip>}
            </div>
            {sending.status === 'verified' && sending.dmarcOk === false && (
              <Alert tone="warning">Add a DMARC record for {sending.domain} so inboxes trust these emails.</Alert>
            )}
            {sending.status === 'failed' && sending.error && <ErrorNote passive>{sending.error}</ErrorNote>}
            {sending.status !== 'verified' && records.length > 0 && <DnsRecordsTable records={records} />}
            {sending.status === 'failed' ? (
              <WriteGuard>
                <div>
                  <Button type="button" variant="outline" disabled={removing} onClick={() => startRemove(async () => setResult(await remove(OK, new FormData())))}>
                    Remove and try again
                  </Button>
                </div>
              </WriteGuard>
            ) : (
              <ConfirmForm
                action={confirmRemove}
                submit="Remove"
                variant="outline"
                title={`Remove ${sending.domain}?`}
                body="Client emails will come from the address they used before."
                confirmLabel="Remove"
                tone="danger"
              />
            )}
          </>
        )}
        <ResultLine result={result} />
      </div>
    </Section>
  );
}
