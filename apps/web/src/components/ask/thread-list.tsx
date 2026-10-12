'use client';
import type { AskThreadSummary } from '@cs/tools';
import { Button, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@cs/ui';
import { MessagesSquare, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { FormResult } from '@/server/forms';

export type DeleteThreadAction = (prev: FormResult, fd: FormData) => Promise<FormResult>;

interface ThreadListProps {
  clientId: string;
  threads: AskThreadSummary[];
  activeId: string | null;
  deleteAction: DeleteThreadAction;
}

function DeleteButton({ clientId, thread, active, deleteAction }: { clientId: string; thread: AskThreadSummary; active: boolean; deleteAction: DeleteThreadAction }) {
  const [state, formAction, pending] = useActionState(deleteAction, { ok: true } as FormResult);
  return (
    <form action={formAction} className="flex-shrink-0">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="threadId" value={thread.id} />
      {active && <input type="hidden" name="active" value="1" />}
      <button
        type="submit"
        disabled={pending}
        aria-label={`Delete thread “${thread.title}”`}
        title={!state.ok && state.error ? state.error : 'Delete thread'}
        className="grid h-7 w-7 place-items-center rounded-md text-muted-ink hover:bg-muted-surface hover:text-danger disabled:opacity-50"
      >
        <Trash2 aria-hidden className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

/** The author's own threads (spec "Web": thread delete for the author). */
export function ThreadList({ clientId, threads, activeId, deleteAction }: ThreadListProps) {
  return (
    <nav aria-label="Your questions" className="flex flex-col gap-2">
      <Button asChild variant="outline" size="sm" className="justify-start">
        <Link href={`/c/${clientId}/ask`}>
          <Plus aria-hidden className="h-4 w-4" />
          New question
        </Link>
      </Button>
      {threads.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">Your questions appear here. Only you can see them.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {threads.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id} className={`flex items-center gap-1 rounded-lg ${active ? 'bg-primary-soft' : 'hover:bg-muted-surface'}`}>
                <Link
                  href={`/c/${clientId}/ask/${t.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={`min-w-0 flex-1 truncate px-2.5 py-2 text-[13px] ${active ? 'font-semibold text-primary-soft-text' : 'text-ink/80'}`}
                  title={t.title}
                >
                  {t.title}
                </Link>
                <DeleteButton clientId={clientId} thread={t} active={active} deleteAction={deleteAction} />
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
