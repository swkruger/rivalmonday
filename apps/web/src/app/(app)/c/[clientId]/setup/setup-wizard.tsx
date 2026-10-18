'use client';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@cs/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { useReadOnly } from '@/components/read-only';
import { advanceSetupAction, enableBillingAction, inviteOwnerAction, pickSetupCompetitorsAction, saveSetupProfileAction, sendReviewAction, type SetupAdvance, setupStatusAction } from './actions';
import { refusalCopy } from './refusal-copy';
import { BillingStep, type BillingPrefill } from './steps/billing-step';
import { BusinessStep, type ProfileInitial } from './steps/business-step';
import { InviteForm, InviteStatus, InviteStep } from './steps/invite-step';
import { PickStep } from './steps/pick-step';
import { SearchStep } from './steps/search-step';
import type { ClientSetupView, SetupActionResult } from './types';
import { ErrorNote } from '@/components/form-error';

type StepKey = 'profile' | 'search' | 'competitors' | 'invite' | 'billing';
const STEPS: { key: StepKey; label: string }[] = [
  { key: 'profile', label: 'Your business' },
  { key: 'search', label: 'Finding competitors' },
  { key: 'competitors', label: 'Pick competitors' },
  { key: 'invite', label: 'Invite the owner' },
  { key: 'billing', label: 'Billing' },
];

/** Client roles see only their own three steps; staff see 5 (clients) or 4 (prospects) — `totalSteps`. */
const stepsFor = (agency: boolean, totalSteps: number) => STEPS.slice(0, agency ? totalSteps : 3);

const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 10_000;
const FAST_FOR_MS = 60_000;
const GIVE_UP_MS = 60 * 60_000;

const signature = (v: ClientSetupView) => `${v.state.steps.profile}|${v.state.steps.search}|${v.state.steps.competitors}|${v.state.steps.invite ?? ''}|${v.state.steps.billing ?? ''}|${v.invite.status}|${v.suggestions.status}|${v.search?.status ?? ''}|${v.state.open}`;

/**
 * Same shape as `useSearchProgress` (competitors/competitor-controls.tsx): every 5 s for the first minute, then every
 * 10 s, up to 60 minutes, and it stops as soon as nothing is pending or running. A change in what the server reports
 * (a step finished, suggestions arrived) re-fetches the page; the counters in between come from the polled data.
 */
function useSetupPoll(clientId: string, view: ClientSetupView): ClientSetupView {
  const { refresh } = useRouter();
  const [polled, setPolled] = useState<ClientSetupView | null>(null);
  const [seen, setSeen] = useState(view);
  if (seen !== view) {
    setSeen(view);
    setPolled(null);
  }
  const waiting = view.suggestions.status === 'pending' || view.state.steps.search === 'running';
  const baseline = signature(view);
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const schedule = () => {
      const elapsed = Date.now() - started;
      if (elapsed >= GIVE_UP_MS) return;
      timer = setTimeout(check, elapsed < FAST_FOR_MS ? FAST_POLL_MS : SLOW_POLL_MS);
    };
    const check = async () => {
      const r = await setupStatusAction(clientId).catch(() => null);
      if (stopped) return;
      if (r?.ok) {
        setPolled(r.data);
        if (signature(r.data) !== baseline) {
          refresh();
          return;
        }
      }
      schedule();
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [waiting, baseline, clientId, refresh]);
  return polled ?? view;
}

function Stepper({ current, steps, list }: { current: StepKey; steps: ClientSetupView['state']['steps']; list: typeof STEPS }) {
  return (
    <ol aria-label="Setup steps" className="flex flex-wrap gap-2">
      {list.map((s, i) => {
        const done = steps[s.key] === 'done' || steps[s.key] === 'skipped';
        const active = s.key === current;
        return (
          <li
            key={s.key} aria-current={active ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${active ? 'bg-primary-soft text-primary-soft-text' : done ? 'bg-muted-surface text-ink' : 'bg-muted-surface text-muted-foreground'}`}
          >
            <span aria-hidden>{done ? '✓' : i + 1}</span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function currentStep(steps: ClientSetupView['state']['steps'], list: typeof STEPS): StepKey {
  const open = (k: StepKey) => ['todo', 'running', 'blocked'].includes(steps[k] ?? 'done');
  return list.find((s) => open(s.key))?.key ?? list[list.length - 1]!.key;
}

export function SetupWizard({
  clientId, agency, isAdmin, view: initial, profile, billing,
}: { clientId: string; agency: boolean; isAdmin: boolean; view: ClientSetupView; profile: ProfileInitial; billing: BillingPrefill | null }) {
  const readOnly = useReadOnly();
  const view = useSetupPoll(clientId, initial);
  const [pending, start] = useTransition();
  // Hoisted here (always mounted): a refusal or error must survive the revalidation that swaps the step.
  const [notice, setNotice] = useState<{ kind: 'error' | 'info' | 'ok'; text: string } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { steps } = view.state;
  const list = stepsFor(agency, view.state.totalSteps);
  const current = currentStep(steps, list);

  const run = (job: () => Promise<SetupActionResult>) =>
    start(async () => {
      const r = await job();
      if (!r.ok) setNotice({ kind: 'error', text: r.error });
      else setNotice(r.searchRefusal ? { kind: 'info', text: r.searchRefusal } : null);
    });
  const advance = (action: SetupAdvance) => run(() => advanceSetupAction(clientId, action));
  const invite = (name: string, email: string) =>
    start(async () => {
      const r = await inviteOwnerAction(clientId, name, email);
      if (!r.ok) setNotice({ kind: 'error', text: r.error });
      else {
        setInviteOpen(false);
        setNotice({ kind: 'ok', text: 'Invite sent.' });
      }
    });
  const review = () =>
    start(async () => {
      const r = await sendReviewAction(clientId);
      if (!r.ok) setNotice({ kind: 'error', text: r.error });
      else setNotice({ kind: 'ok', text: r.data.queued ? 'Review email sent.' : 'Nothing new to send right now.' });
    });

  // A start/save refusal is already plain words; a failed run arrives as a code and is mapped.
  const refusal = notice?.kind === 'info' ? notice.text : refusalCopy(view.state.searchRefusal);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Stepper current={current} steps={steps} list={list} />
      {notice?.kind === 'error' && (
        <ErrorNote>{notice.text}</ErrorNote>
      )}
      {notice?.kind === 'ok' && <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">{notice.text}</p>}
      {current === 'profile' && (
        <BusinessStep view={view} profile={profile} pending={pending} onSave={(fd) => run(() => saveSetupProfileAction(clientId, fd))} />
      )}
      {current === 'search' && (
        <SearchStep
          view={view} agency={agency} pending={pending} refusal={steps.search === 'running' ? null : refusal}
          onStart={() => advance('start_search')} onSkip={() => advance('skip_search')}
        />
      )}
      {current === 'competitors' && (
        <PickStep
          suggestions={view.competitorSuggestions} pending={pending}
          onDone={(accept) => run(async () => {
            const picked = await pickSetupCompetitorsAction(clientId, accept, []);
            return picked.ok ? advanceSetupAction(clientId, 'confirm_competitors') : picked;
          })}
          onSkip={() => advance('skip_competitors')}
          reviewer={agency && view.invite.status !== 'none' ? view.invite.name ?? view.invite.email : null} onReview={review}
        />
      )}
      {current === 'invite' && <InviteStep invite={view.invite} pending={pending} onInvite={invite} onSkip={() => advance('skip_invite')} />}
      {current === 'billing' && (
        <BillingStep
          isAdmin={isAdmin} prefill={billing} skipped={steps.billing === 'skipped'} pending={pending}
          onEnable={(price, fee) => run(() => enableBillingAction(clientId, price, fee))} onSkip={() => advance('skip_billing')}
        />
      )}
      {agency && !readOnly && (current === 'profile' || current === 'search' || current === 'competitors') && (
        <div className="border-t border-line pt-4">
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">Invite the owner</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite the owner</DialogTitle>
                <DialogDescription>They get an email with a sign-in link. You can keep going while you wait.</DialogDescription>
              </DialogHeader>
              <InviteStatus invite={view.invite} />
              <InviteForm invite={view.invite} pending={pending} onInvite={invite} />
            </DialogContent>
          </Dialog>
        </div>
      )}
      {agency && !readOnly && (
        <div className="border-t border-line pt-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="sm">Dismiss setup</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dismiss setup?</DialogTitle>
                <DialogDescription>Hide setup for this client? You can still edit everything in settings.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="destructive" disabled={pending} onClick={() => advance('dismiss')}>Dismiss setup</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
