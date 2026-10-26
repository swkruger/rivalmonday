'use client';
import Image from 'next/image';
import Link from 'next/link';
import { OnboardingShell } from '@/components/onboarding/onboarding-shell';
import { Timeline } from '@/components/onboarding/previews/timeline';
import { StepFooter } from '@/components/onboarding/step-footer';
import { useReadOnly } from '@/components/read-only';
import { useTransition } from 'react';
import { finishAction } from '../actions';
import { prevPath, STEP_LABELS, STEPS, stepPath } from '../flow';

export interface DoneSummary {
  agency: string;
  contact: string;
  team: string;
  brand: string;
  /** The saved brand colour, shown as a small swatch; null when none was set. */
  brandColor: string | null;
}

const NEXT = [
  ['Add your first client', 'About 5 minutes: find the business, confirm its services, pick competitors.'],
  ['We start watching', 'Their starting-point brief is ready within 48 hours.'],
  ['A brief every Monday', 'You approve it before your client sees it.'],
] as const;

/** Step 4 (spec 16 §5): a summary with Edit links, what happens next, and the two ways out. Both finish the wizard. */
export function DoneStep({ firstName, summary, guide }: { firstName: string; summary: DoneSummary; guide: boolean }) {
  const readOnly = useReadOnly();
  const [going, start] = useTransition();
  const rows: [string, React.ReactNode, ReturnType<typeof stepPath>][] = [
    ['Agency', summary.agency, stepPath('profile')],
    ['Contact', summary.contact, stepPath('profile')],
    ['Team', summary.team, stepPath('team')],
    ['Brand', <span key="b" className="flex items-center gap-2">{summary.brandColor && <span aria-hidden="true" className="size-3.5 rounded-sm" style={{ background: summary.brandColor }} />}{summary.brand}</span>, stepPath('branding')],
  ];
  return (
    <OnboardingShell
      brand={{ kind: 'platform' }}
      step={{ n: 4, of: STEPS.length, label: STEP_LABELS.done }}
      exit={{ href: '/agency', label: 'Save and exit' }}
      title={firstName ? `You're all set, ${firstName}` : "You're all set"}
      subtitle="Check your details, then add your first client."
      helpKey="page:account.onboarding"
      guide={guide}
      preview={
        <div className="flex flex-col items-center gap-6">
          <Image src="/onboarding/agency-done.webp" alt="A laptop showing a simple dashboard beside a stack of folders and a check mark." width={800} height={800} className="size-[220px] rounded-xl" priority />
          <Timeline />
        </div>
      }
      caption={<><b className="font-semibold">Your first two weeks</b>, from first client to first Monday brief.</>}
      footer={
        <StepFooter
          back={prevPath('done')!}
          skip={{ label: 'Go to dashboard', onSkip: () => { if (!readOnly && !going) start(async () => { const fd = new FormData(); fd.set('to', 'dashboard'); await finishAction(fd); }); }, disabled: readOnly || going }}
          primary={{ label: 'Add your first client', pending: going, disabled: readOnly, form: 'finish-form' }}
        />
      }
    >
      <form id="finish-form" action={finishAction} className="contents"><input type="hidden" name="to" value="client" /></form>
      <ul className="-mt-2 border-t border-line">
        {rows.map(([k, v, href]) => (
          <li key={k} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 border-b border-line py-3 text-sm">
            <span className="text-muted-ink">{k}</span>
            <span>{v}</span>
            <Link href={href} className="text-[13px] font-medium text-secondary">Edit<span className="sr-only"> {k.toLowerCase()}</span></Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="next-heading" className="-mt-1">
        <h2 id="next-heading" className="text-[13px] font-semibold uppercase tracking-[0.05em] text-muted-ink">What happens next</h2>
        <ol className="mt-3.5 flex flex-col gap-3.5">
          {NEXT.map(([title, body], i) => (
            <li key={title} className="grid grid-cols-[28px_1fr] gap-3 text-sm leading-[1.45]">
              <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-[13px] font-semibold text-primary-soft-text">{i + 1}</span>
              <div><b className="font-semibold">{title}</b><div className="text-muted-ink">{body}</div></div>
            </li>
          ))}
        </ol>
      </section>
    </OnboardingShell>
  );
}
