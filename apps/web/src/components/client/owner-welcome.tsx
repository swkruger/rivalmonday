'use client';
import { Button } from '@cs/ui';
import { Users } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { dismissWelcome } from './owner-welcome-actions';

/** The most rivals an owner picks (`MAX_PICKS` of the competitors step; repeated here so this card stays light). */
const PICK_UP_TO = 5;

/** A calm panel line on the owner's first Overview visits; "Dismiss" hides it for good (cookie, set by the server action). */
export function OwnerWelcome({ clientId, line }: { clientId: string; line: string }) {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  return (
    <div className="flex items-center gap-4 rounded-md bg-muted-surface px-[18px] py-3.5 text-sm">
      <p className="flex-1">{line}</p>
      <button
        type="button"
        onClick={() => { setHidden(true); start(() => dismissWelcome(clientId)); }}
        className="text-13 font-medium text-muted-ink hover:text-ink"
      >
        Dismiss
      </button>
    </div>
  );
}

/** Shown while the agency waits on the owner's competitor pick (`waiting_owner`). */
export function OwnerPickCard({ clientId, agency, count, place }: { clientId: string; agency: string; count: number; place: string | null }) {
  const found = count > 0 ? `We found ${count} ${count === 1 ? 'business' : 'businesses'}${place ? ` near ${place}` : ''}. ` : '';
  return (
    <section className="flex max-w-[1000px] items-center gap-5 rounded-lg border border-line px-6 py-[22px]">
      <div aria-hidden="true" className="flex size-11 flex-none items-center justify-center rounded-lg bg-primary-soft text-primary-soft-text"><Users className="size-[22px]" /></div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{agency} asked you to choose who to watch</h2>
        <p className="mt-1 text-sm text-muted-ink">{`${found}Pick up to ${PICK_UP_TO} to compare with you every week.`}</p>
      </div>
      <Button asChild size="lg"><Link href={`/c/${clientId}/setup/competitors`}>Choose competitors</Link></Button>
    </section>
  );
}
