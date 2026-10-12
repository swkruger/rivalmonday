'use client';
import type { AskActionView } from '@cs/tools';
import { Button } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ToolResult } from '@/server/run-tool';

export type ConfirmAskAction = (messageId: string, decision: 'confirm' | 'cancel') => Promise<ToolResult<{ state: string }>>;

/**
 * e8: a write the assistant proposed. Shown only while `proposed`; the server action moves it on in one guarded
 * UPDATE and revalidates the thread, so after a refresh this card is gone and the "Saved." / "Cancelled." message
 * follows. A `failed` action keeps its stored error (it survives the revalidation because it is data).
 */
export function ConfirmCard({ messageId, action, confirmAction }: { messageId: string; action: AskActionView; confirmAction: ConfirmAskAction }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!action) return null;
  if (action.state === 'failed') {
    return (
      <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">
        {action.summary} — {action.error ?? 'Something went wrong. Please try again.'}
      </p>
    );
  }
  if (action.state !== 'proposed') return null;

  const decide = (decision: 'confirm' | 'cancel') =>
    start(async () => {
      setError(null);
      const r = await confirmAction(messageId, decision);
      if (!r.ok) setError(r.error);
      router.refresh();
    });

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="font-semibold">{action.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => decide('confirm')}>
          Confirm
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => decide('cancel')}>
          Cancel
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-muted-surface p-3 text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
