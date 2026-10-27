'use client';
import { Button, ConfirmDialog } from '@cs/ui';
import { useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { WriteGuard } from '@/components/read-only';
import type { FormResult } from '@/server/forms';
import { resetAiPauseAction } from '../actions';

/**
 * Reset (staff+). Always mounted for staff so the result survives the revalidation that removes the button
 * (hoisted-state rule); the button shows only while the guard is warning or paused.
 */
export function ResetAiPause({ active }: { active: boolean }) {
  const [result, setResult] = useState<FormResult | null>(null);
  return (
    <WriteGuard>
      <div className="flex flex-wrap items-center gap-3">
        {active && (
          <ConfirmDialog
            trigger={<Button type="button" variant="outline">Reset</Button>}
            title="Reset the AI guard?"
            body={
              <div className="grid gap-2">
                <p>This clears the warning or pause and lets queued AI work resume. The guard then stays quiet for the snooze period, so pause-level readings only warn.</p>
                <label htmlFor="reset-ai-note" className="text-sm font-medium text-ink">Note (required, up to 200 characters)</label>
                <textarea
                  id="reset-ai-note"
                  name="note"
                  required
                  maxLength={200}
                  rows={3}
                  className="rounded-sm border border-input bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-inset aria-invalid:ring-danger disabled:border-line-control disabled:bg-canvas disabled:text-muted-ink"
                />
              </div>
            }
            confirmLabel="Confirm reset"
            action={async (fd) => setResult(await resetAiPauseAction({ ok: true }, fd))}
          />
        )}
        {result?.ok && result.message && <span role="status" className="text-sm text-ink">{result.message}</span>}
        {result && !result.ok && <ErrorNote compact focusKey={result}>{result.error}</ErrorNote>}
      </div>
    </WriteGuard>
  );
}
