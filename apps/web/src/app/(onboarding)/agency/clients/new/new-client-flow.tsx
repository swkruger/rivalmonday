'use client';
import { useState, useTransition } from 'react';
import type { VerticalActions } from '@/components/new-business-type';
import type { OnboardingBrand } from '@/components/onboarding/onboarding-shell';
import type { FormResult } from '@/server/forms';
import type { VerticalOption } from '@/server/verticals';
import { wizardSteps } from '../../../c/[clientId]/setup/wizard-steps';
import type { FindBusinessResult, FoundPlace } from './actions';
import { type ClientDraft, EMPTY_DRAFT, fillBlanks, locationOf } from './details-model';
import { DetailsStep, type FlowKind } from './details-step';
import { FindStep, type Selection } from './find-step';

/**
 * Steps 1-2 of adding a client (or a prospect) in one client component (16 P4): the draft lives here, so Back from step 2
 * keeps what was typed, and nothing exists on the server until step 2 completes (`create`, which redirects to the setup).
 */
export function NewClientFlow({ kind, agency, admin, verticals, verticalActions, find, create, canUpgrade, guide }: {
  kind: FlowKind; agency: { name: string; logoUrl: string | null }; admin: boolean;
  verticals: VerticalOption[]; verticalActions?: VerticalActions;
  find: (input: { name: string; location: string }) => Promise<FindBusinessResult>;
  create: (fd: FormData) => Promise<FormResult>;
  canUpgrade: boolean; guide: boolean;
}) {
  const [step, setStep] = useState<'details' | 'lookup'>('details');
  const [draft, setDraft] = useState<ClientDraft>(EMPTY_DRAFT);
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, start] = useTransition();
  const brand: OnboardingBrand = { kind: 'agency', name: agency.name, logoUrl: agency.logoUrl, style: {} }; // the theme variables are already on <html>
  const steps = wizardSteps(admin, kind === 'prospect' ? 5 : 6).length;
  const exitHref = kind === 'prospect' ? '/agency/prospects' : '/agency';

  const submit = (s: Selection) => {
    const fd = new FormData();
    const d = draft;
    for (const [k, v] of Object.entries({ name: d.name, contactName: d.contactName, phone: d.phone, email: d.email, line1: d.line1, city: d.city, region: d.region, postalCode: d.postalCode, verticalId: s.verticalId, locality: s.locality })) fd.set(k, v);
    if (s.lookup) {
      const { suggestedVerticalId: _s, isClaimed: _c, possibleDuplicate: _p, ...lookup } = s.lookup;
      fd.set('lookup', JSON.stringify(lookup));
    }
    if (d.logo) fd.set('logo', d.logo);
    setResult(null);
    start(async () => {
      const r = await create(fd); // a success redirects; only a refusal comes back
      if (r && !r.ok) setResult(r);
    });
  };

  if (step === 'details') {
    return (
      <DetailsStep
        kind={kind} brand={brand} agencyName={agency.name} steps={steps} draft={draft} guide={guide} exitHref={exitHref}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onContinue={() => setStep('lookup')}
      />
    );
  }
  return (
    <FindStep
      kind={kind} brand={brand} steps={steps} initialName={draft.name} initialLocation={locationOf(draft)} guide={guide} exitHref={exitHref}
      find={find} verticals={verticals} verticalActions={verticalActions} canUpgrade={canUpgrade}
      onPick={(p: FoundPlace) => setDraft((d) => fillBlanks(d, p))}
      onBack={() => { setResult(null); setStep('details'); }}
      onCreate={submit} pending={pending} result={result}
    />
  );
}
