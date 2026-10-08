'use client';
import type { ProspectReportView } from '@cs/tools';
import { Button } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import type { FormResult } from '@/server/forms';

const POLL_MS = 10_000;
const POLL_FOR_MS = 15 * 60_000;

export function SnapshotControls({ clientId, report, canRun, blockers, action }: {
  clientId: string; report: ProspectReportView | null; canRun: boolean; blockers: string[]; action: (p: FormResult, fd: FormData) => Promise<FormResult>;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true } as FormResult);
  const router = useRouter();
  const running = report?.status === 'running';
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
      <Button type="submit" disabled={!canRun || running || pending} className="self-start">{report ? 'Run snapshot again' : 'Run snapshot'}</Button>
      {running && <p className="rounded-lg bg-muted-surface p-3 text-ink">Snapshot running — this page updates by itself.</p>}
      {report?.status === 'failed' && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{report.error ?? 'The snapshot failed.'}</p>}
      {!state.ok && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>}
      {state.ok && state.message && !running && <p className="rounded-lg bg-muted-surface p-3 text-ink">{state.message}</p>}
    </form>
  );
}
