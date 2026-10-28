'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { advanceSetupAction, pickSetupCompetitorsAction } from '../actions';
import { CompetitorsStep } from '../steps/competitors-step';
import type { StepFrame } from '../steps/frame';
import type { ClientSetupView } from '../types';

/**
 * Spec 16 §7: the owner's one setup screen. The staff pick step, minus everything staff-only (progress, Back, Skip, "Ask the
 * owner"). Confirming tracks the ticked businesses, closes the step and returns to the Overview. The server only lets an
 * owner run these two operations, and only while the agency's request is open (P8, P13).
 */
export function OwnerCompetitors({ clientId, clientName, agency, place, radiusMiles, keywordCount, view, guide }: {
  clientId: string; clientName: string; agency: { name: string; logoUrl: string | null }; place: string | null;
  radiusMiles: number; keywordCount: number; view: ClientSetupView; guide: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const overview = `/c/${clientId}`;

  const frame: StepFrame = {
    brand: { kind: 'agency', name: agency.name, logoUrl: agency.logoUrl, style: {} }, // the theme variables are already on <html>
    exitSlot: <Link href={overview} className="text-13 font-medium text-muted-ink hover:text-ink">Back to Overview</Link>,
    guide, steps: [],
  };
  const confirm = (accept: string[]) =>
    start(async () => {
      setError(null);
      const picked = await pickSetupCompetitorsAction(clientId, accept, []);
      const done = picked.ok ? await advanceSetupAction(clientId, 'confirm_competitors') : picked;
      if (!done.ok) { setError(done.error); return; }
      router.push(overview);
    });

  return (
    <CompetitorsStep
      frame={frame} view={view} clientId={clientId} clientName={clientName} ownerName={null} keywordCount={keywordCount} radiusMiles={radiusMiles}
      pending={pending} error={error} refusal={null} owner={{ agencyName: agency.name, place }}
      onStart={() => {}} onSkip={() => {}} onAskOwner={() => {}} onCancelAsk={() => {}} onNext={() => router.push(overview)} onContinue={confirm}
    />
  );
}
