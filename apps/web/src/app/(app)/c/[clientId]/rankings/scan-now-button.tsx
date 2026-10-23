'use client';
import { Button } from '@cs/ui';
import { useActionState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { requestRankScan } from './actions';
import { type RankScanInfo, SCAN_RUNNING } from './scan-copy';

const INITIAL: FormResult = { ok: true };

/**
 * Phase 13b "Scan now" (agency roles only; the page renders it only for them). `weekly_limit` and `running` put their
 * label on the disabled button; the agency-daily and cap copy is long, so it sits beside a disabled "Scan now".
 * `not_ready` (incl. a paused or inactive client) renders nothing. The result message lives in this always-mounted
 * component, so it survives the page revalidation the action triggers.
 */
export function ScanNowButton({ clientId, scan }: { clientId: string; scan: RankScanInfo }) {
  const [state, action, pending] = useActionState(async (_p: FormResult) => requestRankScan(clientId), INITIAL);
  if (scan.state === 'not_ready') return null;
  const queued = state.ok && Boolean(state.message);
  const running = queued || scan.state === 'running';
  const label = running ? SCAN_RUNNING : scan.state === 'weekly_limit' && scan.label ? scan.label : 'Scan now';
  const note = !running && (scan.state === 'agency_daily_limit' || scan.state === 'cap' || scan.state === 'spend_paused') ? scan.label : null;
  return (
    <WriteGuard>
      <div className="flex max-w-md flex-col items-end gap-1.5">
        <form action={action}>
          <Button type="submit" variant="outline" disabled={pending || running || scan.state !== 'available'}>{label}</Button>
        </form>
        {note && <p className="text-right text-sm text-muted-foreground">{note}</p>}
        {!state.ok && <ErrorNote compact focusKey={state} className="justify-end text-right">{state.error}</ErrorNote>}
        {state.ok && state.message && <p role="status" className="text-right text-sm text-ink">{state.message}</p>}
      </div>
    </WriteGuard>
  );
}
