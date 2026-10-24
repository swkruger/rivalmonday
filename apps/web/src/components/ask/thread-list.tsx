'use client';
import type { AskThreadSummary } from '@cs/tools';
import { Button, ConfirmDialog, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@cs/ui';
import { MessagesSquare, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote } from '@/components/form-error';
import { useReadOnly } from '@/components/read-only';
import type { FormResult } from '@/server/forms';

export type DeleteThreadAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;

type RowError = Record<string, string | undefined>;

interface ThreadListProps {
  clientId: string;
  threads: AskThreadSummary[];
  activeId: string | null;
  deleteAction: DeleteThreadAction;
}

function ResultLine({ error }: { error: string | undefined }) {
  if (!error) return null;
  return <ErrorNote compact focusKey={error} className="px-2.5 pb-2">{error}</ErrorNote>;
}

function DeleteButton({ clientId, thread, active, deleteAction, onError }: { clientId: string; thread: AskThreadSummary; active: boolean; deleteAction: DeleteThreadAction; onError: (id: string, error: string | undefined) => void }) {
  return (
    <ConfirmDialog
      trigger={
        <button
          type="button"
          aria-label={`Delete conversation “${thread.title}”`}
          title="Delete conversation"
          className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-muted-ink hover:bg-muted-surface hover:text-danger"
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
        </button>
      }
      title="Delete this conversation?"
      body="It disappears from your list. This can't be undone."
      confirmLabel="Delete"
      tone="danger"
      fields={{ clientId, threadId: thread.id, active: active ? '1' : '0' }}
      action={async (fd) => {
        onError(thread.id, undefined);
        const r = await deleteAction({ ok: true }, fd);
        if (!r.ok) onError(thread.id, r.error);
      }}
    />
  );
}

/** The author's own threads (spec "Web": thread delete for the author). */
export function ThreadList({ clientId, threads, activeId, deleteAction }: ThreadListProps) {
  const readOnly = useReadOnly();
  // Result lines live here (always mounted), keyed by thread: the dialog unmounts with its row on revalidate.
  const [errors, setErrors] = useState<RowError>({});
  const onError = (id: string, error: string | undefined) => setErrors((prev) => ({ ...prev, [id]: error }));
  return (
    <nav aria-label="Your questions" className="flex flex-col gap-2">
      <Button asChild variant="outline" size="sm" className="justify-start">
        <Link href={`/c/${clientId}/ask`}>
          <Plus aria-hidden className="h-4 w-4" />
          New question
        </Link>
      </Button>
      {threads.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">Your questions appear here.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {threads.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id} className={`rounded-lg ${active ? 'bg-primary-soft' : 'hover:bg-muted-surface'}`}>
                <div className="flex items-center gap-1">
                <Link
                  href={`/c/${clientId}/ask/${t.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={`min-w-0 flex-1 truncate px-2.5 py-2 text-[13px] ${active ? 'font-semibold text-primary-soft-text' : 'text-ink/80'}`}
                  title={t.title}
                >
                  {t.title}
                </Link>
                {!readOnly && <DeleteButton clientId={clientId} thread={t} active={active} deleteAction={deleteAction} onError={onError} />}
                </div>
                <ResultLine error={errors[t.id]} />
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

/** Below `lg` the thread list opens in a drawer; any link tap closes it. */
export function ThreadDrawer(props: ThreadListProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="lg:hidden">
          <MessagesSquare aria-hidden className="h-4 w-4" />
          Your questions
        </Button>
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>
        <SheetTitle className="px-1 pb-3 text-sm font-semibold">Your questions</SheetTitle>
        <ThreadList {...props} />
      </SheetContent>
    </Sheet>
  );
}
