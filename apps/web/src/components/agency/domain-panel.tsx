'use client';
import type { AgencyDomainsView } from '@cs/tools';
import { Button, Field, Input, Section, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { useActionState, useState, useTransition } from 'react';
import { ConfirmForm } from '@/components/confirm-form';
import { CopyButton } from '@/components/copy-button';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import { AGENCY_DOMAIN_STATUS, labelFor } from '@/lib/labels';
import type { FormResult } from '@/server/forms';

export type CustomDomain = AgencyDomainsView['custom'];
export type FormAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;
export type DnsRow = { type: string; name: string; value: string };

const OK: FormResult = { ok: true };

/** The records an agency creates at its DNS provider: type / name / value, each value with its own copy button. */
export function DnsRecordsTable({ records }: { records: DnsRow[] }) {
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Value</TableHead>
            <TableHead><span className="sr-only">Copy</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r) => (
            <TableRow key={`${r.type}:${r.name}:${r.value}`}>
              <TableCell>{r.type}</TableCell>
              <TableCell className="font-mono text-ink">{r.name}</TableCell>
              <TableCell className="max-w-96 font-mono break-all whitespace-normal text-ink">{r.value}</TableCell>
              <TableCell className="text-right"><CopyButton text={r.value} label="Copy" ariaLabel={`Copy ${r.type} value for ${r.name}`} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

/** The result line of a panel: outside every state branch, so a refusal survives the revalidation that swaps the state. */
export function ResultLine({ result }: { result: FormResult }) {
  if (!result.ok) return <ErrorNote compact focusKey={result}>{result.error}</ErrorNote>;
  return result.message ? <p role="status" className="text-sm text-ink">{result.message}</p> : null;
}

/**
 * 13a1 Domains page, "Web address": the agency's custom client subdomain in each state (none → field + Save; pending /
 * verifying → the CNAME records and the chip; live → hostname + live date; failed → the stored error + "Remove and try
 * again"). The fallback host is named until the custom one is live. `liveDate` is formatted server-side in the viewer's zone.
 */
export function DomainPanel({ fallbackHost, custom, liveDate, save, remove }: {
  fallbackHost: string;
  custom: CustomDomain;
  liveDate: string | null;
  save: FormAction;
  remove: FormAction;
}) {
  const [hostname, setHostname] = useState('');
  // One result line for every write here (the latest wins).
  const [result, setResult] = useState<FormResult>(OK);
  const [, saveAction, saving] = useActionState<FormResult, FormData>(async (prev, fd) => {
    const r = await save(prev, fd);
    setResult(r);
    return r;
  }, OK);
  const [removing, startRemove] = useTransition();
  const fallback = <p className="text-13 text-muted-ink">Until then, clients use <span className="font-medium text-ink">{fallbackHost}</span>.</p>;
  const status = custom ? labelFor(AGENCY_DOMAIN_STATUS, custom.status) : null;
  const confirmRemove: FormAction = async (prev, fd) => {
    setResult(await remove(prev, fd));
    return OK;
  };

  return (
    <Section title="Web address">
      <div className="flex max-w-3xl flex-col gap-4">
        {!custom ? (
          <>
            <WriteGuard>
              <form action={saveAction} onReset={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-2">
                <Field label="Domain" className="w-80 max-w-full">
                  <Input name="hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="intel.youragency.com" maxLength={253} autoComplete="off" spellCheck={false} />
                </Field>
                <Button type="submit" variant="ink" disabled={saving}>Save</Button>
              </form>
            </WriteGuard>
            {fallback}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{custom.hostname}</span>
              {status && <StatusChip tone={status.tone}>{status.label}</StatusChip>}
              {custom.status === 'live' && liveDate && <span className="text-13 text-muted-ink">since {liveDate}</span>}
            </div>
            {(custom.status === 'pending' || custom.status === 'verifying') && (
              <>
                <p className="text-13 text-muted-ink">Add a CNAME record at your DNS provider. We check every 10 minutes for up to 72 hours.</p>
                {custom.dnsRecords.length > 0 && <DnsRecordsTable records={custom.dnsRecords} />}
              </>
            )}
            {custom.status === 'failed' && custom.error && <ErrorNote passive>{custom.error}</ErrorNote>}
            {custom.status !== 'live' && fallback}
            {custom.status === 'failed' ? (
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
                title={`Remove ${custom.hostname}?`}
                body="Links in emails already sent to clients will stop working."
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
