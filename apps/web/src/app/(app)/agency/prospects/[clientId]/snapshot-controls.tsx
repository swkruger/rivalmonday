'use client';
import type { ProspectReportView } from '@cs/tools';
import { Button } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { ErrorNote } from '@/components/form-error';

const POLL_MS = 10_000;
const POLL_FOR_MS = 15 * 60_000;

export function SnapshotControls({ clientId, report, canRun, blockers, action }: {
  clientId: string; report: ProspectReportView | null; canRun: boolean; blockers: string[]; action: (p: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  const router = useRouter();
  const running = report?.status === 'running';
  // A failed report already there on load is stored state (no focus); one that fails while this page watched it run
  // is a new error.
  const [failedOnLoad] = useState(report?.status === 'failed');
  const [sawRunning, setSawRunning] = useState(false);
  useEffect(() => {
    if (running) setSawRunning(true);
  }, [running]);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => {
      if (Date.now() - started > POLL_FOR_MS) clearInterval(t);
      else router.refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [running, router]);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      {blockers.length > 0 && <ul className="list-disc pl-5 text-sm">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <WriteGuard>
        <Button type="submit" disabled={!canRun || running || pending} className="self-start">{report ? 'Run snapshot again' : 'Run snapshot'}</Button>
      </WriteGuard>
      {running && <p className="rounded-md bg-muted-surface p-3 text-ink">Snapshot running — this page updates by itself.</p>}
      {report?.status === 'failed' && <ErrorNote passive={failedOnLoad && !sawRunning}>{report.error ?? 'The snapshot failed.'}</ErrorNote>}
      {!state.ok && <ErrorNote focusKey={state}>{state.error}</ErrorNote>}
      {state.ok && state.message && !running && <p className="rounded-md bg-muted-surface p-3 text-ink">{state.message}</p>}
    </form>
  );
}
