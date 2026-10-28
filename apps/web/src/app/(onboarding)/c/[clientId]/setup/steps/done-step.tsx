'use client';
import { Button } from '@cs/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorNote } from '@/components/form-error';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { StepFooter } from '@/components/onboarding/step-footer';
import { useReadOnly } from '@/components/read-only';
import { type StepFrame, stepOf } from './frame';

/** The confirmation rows, already worded by the page; `competitorsWaiting` swaps in the "waiting on the owner" row. */
export interface DoneSummary {
  business: string;
  contact: string;
  area: string;
  competitors: string;
  competitorsWaiting: boolean;
  owner: string;
  /** Null when this viewer has no billing step. */
  billing: string | null;
}

/**
 * Step 7 (spec 16 §6): the summary with Edit links, what happens next, and the two ways out. When the owner was asked to
 * pick, the competitors row says so ("Pick now") and the next steps start with their pick. Edit goes to the page where the
 * setting lives afterwards: a finished setup is read-only, so the wizard steps are not offered again.
 */
export function DoneStep({ frame, clientId, clientName, ownerFirstName, summary, prospect, pending = false, error = null, onCancelAsk }: {
  frame: StepFrame; clientId: string; clientName: string; ownerFirstName: string | null; summary: DoneSummary; prospect: boolean;
  pending?: boolean; error?: string | null;
  /** While the owner is asked to pick (I1): staff take the pick back and return to step 4. */
  onCancelAsk?: () => void;
}) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const first = ownerFirstName ?? 'the owner';
  const First = ownerFirstName ?? 'The owner';
  const edit = `/c/${clientId}/settings/profile`;
  // I3: phone, address, owner contact and logo live in the profile's "Business details" section (staff only).
  const details = `${edit}#details`;
  const rows: { k: string; v: React.ReactNode; href: string; label: string }[] = [
    { k: 'Business', v: summary.business, href: details, label: 'Edit' },
    { k: 'Contact', v: summary.contact, href: details, label: 'Edit' },
    { k: 'Area', v: summary.area, href: edit, label: 'Edit' },
    {
      k: 'Competitors',
      v: summary.competitorsWaiting ? <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-warning" />{summary.competitors}</span> : summary.competitors,
      href: `/c/${clientId}/competitors`, label: summary.competitorsWaiting ? 'Pick now' : 'Edit',
    },
    { k: 'Owner', v: summary.owner, href: details, label: 'Edit' },
    ...(summary.billing ? [{ k: 'Billing', v: summary.billing, href: '/agency/settings/billing', label: 'Edit' }] : []),
  ];
  const next = summary.competitorsWaiting
    ? [[`${First} picks competitors`, `They appear on ${ownerFirstName ? `${ownerFirstName}'s` : 'their'} Overview. If ${first} hasn't picked in 14 days, we start anyway.`], ['We start watching', `The starting-point brief is ready within 48 hours of ${ownerFirstName ? `${ownerFirstName}'s` : 'the owner’s'} picks.`]]
    : [['We start watching', 'The starting-point brief is ready within 48 hours.'], ['A brief every Monday', `You approve it before ${first} sees it.`]];
  const another = prospect ? '/agency/prospects/new' : '/agency/clients/new';
  const open = prospect ? `/agency/prospects/${clientId}` : `/c/${clientId}`;

  return (
    <OnboardingShell
      brand={frame.brand}
      exit={{ href: '/agency', label: 'Close' }}
      step={stepOf(frame, 'done')}
      title={`${clientName} is all set`}
      subtitle={summary.competitorsWaiting ? `${First} picks the competitors. Everything else is ready.` : 'Check the details. You can change any of them later in Settings.'}
      helpKey="page:client.setup"
      guide={frame.guide}
      preview={
        <Image src="/onboarding/client-done.webp" alt="A local storefront under a map pin, linked to two shops in the distance, with a calendar marking the next brief." width={800} height={800} className="size-[360px] rounded-lg" priority />
      }
      caption={<><b className="font-semibold">What&apos;s next:</b> {summary.competitorsWaiting ? `${First} picks, then the starting point within 48 hours.` : 'starting point within 48 hours, then a brief every Monday.'}</>}
      footer={<StepFooter skip={{ label: prospect ? 'Add another prospect' : 'Add another client', onSkip: () => router.push(another) }} primary={{ label: `Go to ${clientName}`, form: 'done-form' }} />}
    >
      {error && <ErrorNote focusKey={error}>{error}</ErrorNote>}
      <form id="done-form" onSubmit={(e) => { e.preventDefault(); router.push(open); }} className="contents" />
      <ul className="-mt-2 border-t border-line">
        {rows.map((r) => (
          <li key={r.k} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 border-b border-line py-2.5 text-sm">
            <span className="text-muted-ink">{r.k}</span>
            <span className="min-w-0">{r.v}</span>
            <Link href={r.href} className="text-13 font-medium text-secondary">{r.label}<span className="sr-only"> {r.k.toLowerCase()}</span></Link>
          </li>
        ))}
      </ul>
      {summary.competitorsWaiting && onCancelAsk && !readOnly && (
        <Button type="button" variant="outline" className="self-start" disabled={pending} onClick={onCancelAsk}>Cancel request</Button>
      )}
      <section aria-labelledby="next-heading">
        <h2 id="next-heading" className="text-11 font-medium text-muted-ink">What happens next</h2>
        <ol className="mt-3.5 flex flex-col gap-3.5">
          {next.map(([title, body], i) => (
            <li key={title} className="grid grid-cols-[28px_1fr] gap-3 text-sm leading-[1.45]">
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-13 font-semibold text-primary-soft-text">{i + 1}</span>
              <div><b className="font-semibold">{title}</b><div className="text-muted-ink">{body}</div></div>
            </li>
          ))}
        </ol>
      </section>
    </OnboardingShell>
  );
}
