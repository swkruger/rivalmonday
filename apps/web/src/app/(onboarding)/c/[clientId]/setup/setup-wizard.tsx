'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { kmToMiles } from '@/lib/format';
import { advanceSetupAction, enableBillingAction, inviteOwnerAction, pickSetupCompetitorsAction, saveAreaAction, type AreaInput, type SetupAdvance } from './actions';
import { refusalCopy } from './refusal-copy';
import { AreaStep } from './steps/area-step';
import { BillingStep, type BillingPrefill } from './steps/billing-step';
import { CompetitorsStep } from './steps/competitors-step';
import { DoneStep, type DoneSummary } from './steps/done-step';
import type { StepFrame } from './steps/frame';
import { InviteStep } from './steps/invite-step';
import { SetupExit } from './setup-exit';
import type { ClientSetupView, ProfileInitial, SetupActionResult } from './types';
import { useSetupPoll } from './use-setup-poll';
import { type SetupScreen, stepHref, type WizardStep } from './wizard-steps';

const firstNameOf = (full: string | null | undefined) => full?.trim().split(/\s+/)[0] || null;

/**
 * Steps 3-7 of the client flow (16 §6) on `/c/<id>/setup`. The page picks the screen (`current`); this keeps what must
 * survive a step change: the live view (polled while suggestions or the search are pending), a refusal or error message,
 * and the "Save and exit" menu. Each screen draws its own `OnboardingShell` (its preview and footer follow its form).
 */
export function SetupWizard({ clientId, clientName, agency, prospect, steps, current, view: initial, profile, contact, around, billing, summary, guide, maxKeywords, exitHref }: {
  clientId: string; clientName: string; agency: { name: string; logoUrl: string | null }; prospect: boolean;
  steps: WizardStep[]; current: SetupScreen; view: ClientSetupView; profile: ProfileInitial;
  contact: { name: string | null; email: string | null } | null; around: string | null; billing: BillingPrefill | null; summary: DoneSummary;
  guide: boolean; maxKeywords: number; exitHref: string;
}) {
  const router = useRouter();
  const view = useSetupPoll(clientId, initial);
  const [pending, start] = useTransition();
  // Hoisted here (always mounted): a refusal or error must survive the revalidation that swaps the step.
  const [error, setError] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const go = (step: WizardStep) => { setError(null); router.push(stepHref(clientId, step)); };
  const after = (step: WizardStep): WizardStep => steps[steps.indexOf(step) + 1] ?? 'done';
  const run = (job: () => Promise<SetupActionResult>, then?: () => void) =>
    start(async () => {
      setError(null);
      const r = await job();
      if (!r.ok) { setError(r.error); return; }
      setRefusal(r.searchRefusal);
      then?.();
    });
  const advance = (action: SetupAdvance, then?: () => void) => run(() => advanceSetupAction(clientId, action), then);

  const frame: StepFrame = {
    brand: { kind: 'agency', name: agency.name, logoUrl: agency.logoUrl, style: {} }, // the theme variables are already on <html>
    exitSlot: <SetupExit exitHref={exitHref} pending={pending} onDismiss={() => advance('dismiss', () => router.push(exitHref))} />,
    guide, steps,
  };
  const ownerFirst = firstNameOf(view.invite.name) ?? firstNameOf(contact?.name);
  const back = (step: WizardStep) => stepHref(clientId, step);
  const radiusMiles = profile.serviceArea ? Math.round(kmToMiles(profile.serviceArea.radiusKm)) : 10;

  switch (current) {
    case 'profile':
      return <AreaStep frame={frame} view={view} profile={profile} clientName={clientName} around={around} maxKeywords={maxKeywords} pending={pending} error={error} onSave={(input: AreaInput) => run(() => saveAreaAction(clientId, input), () => go('competitors'))} />;
    case 'competitors':
      return (
        <CompetitorsStep
          frame={frame} view={view} clientId={clientId} clientName={clientName} ownerName={ownerFirst} keywordCount={profile.keywords.length} radiusMiles={radiusMiles}
          backHref={back('profile')} pending={pending} error={error} refusal={refusal ?? refusalCopy(view.state.searchRefusal)}
          onStart={() => advance('start_search')}
          onSkip={() => advance('skip_competitors', () => go(after('competitors')))}
          onContinue={(accept) => run(async () => {
            const picked = await pickSetupCompetitorsAction(clientId, accept, []);
            return picked.ok ? advanceSetupAction(clientId, 'confirm_competitors') : picked;
          }, () => go(after('competitors')))}
          onAskOwner={() => advance('ask_owner', () => go(after('competitors')))}
          onCancelAsk={() => advance('cancel_ask_owner')}
          onNext={() => go(after('competitors'))}
        />
      );
    case 'invite':
      return (
        <InviteStep
          frame={frame} clientName={clientName} agencyName={agency.name} contact={contact} invite={view.invite}
          rivals={view.competitorSuggestions.filter((s) => s.status === 'accepted').map((s) => s.name)}
          waitingOwner={view.state.competitors === 'waiting_owner'} backHref={back('competitors')} pending={pending} error={error}
          onSend={(name, email) => run(() => inviteOwnerAction(clientId, name, email), () => go(after('invite')))}
          onSkip={() => advance('skip_invite', () => go(after('invite')))}
        />
      );
    case 'billing':
      return (
        <BillingStep
          frame={frame} agencyName={agency.name} clientName={clientName} ownerFirstName={ownerFirst} prefill={billing} skipped={view.state.steps.billing === 'skipped'}
          backHref={back('invite')} pending={pending} error={error}
          onEnable={(price, fee) => run(() => enableBillingAction(clientId, price, fee), () => go('done'))}
          onSkip={() => advance('skip_billing', () => go('done'))}
        />
      );
    case 'done':
      return (
        <DoneStep
          frame={frame} clientId={clientId} clientName={clientName} ownerFirstName={ownerFirst} summary={summary} prospect={prospect} pending={pending} error={error}
          onCancelAsk={() => advance('cancel_ask_owner', () => go('competitors'))}
        />
      );
  }
}
