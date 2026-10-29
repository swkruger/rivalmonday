'use client';

import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@cs/ui';
import { useState } from 'react';
import { siteEnv } from '../../lib/env';
import {
  validateAgency, validateBusiness,
  type AgencyForm, type BusinessForm, type FieldErrors,
} from '../../lib/waitlist-body';
import { usePilot } from '../shell/pilot-context';
import { JOIN_COPY } from './copy';
import type { JoinStart } from './join-provider';
import { StepAgency, AGENCY_FIELD_ORDER } from './step-agency';
import { StepBusiness, BUSINESS_FIELD_ORDER } from './step-business';
import { StepChoose, type JoinChoice } from './step-choose';

/** What a validated step 2 hands to the submit seam (Task 8 adds the Turnstile token, POSTs `buildWaitlistBody(...)`). */
export type JoinSubmission = { kind: 'agency'; form: AgencyForm } | { kind: 'business'; form: BusinessForm };
/** Task 8 supplies this; `{ ok: true }` shows the done screen, `{ ok: false }` shows the message above the submit row. */
export type JoinSubmit = (input: JoinSubmission) => Promise<{ ok: true } | { ok: false; error: string }>;

type Step = 'choose' | 'agency' | 'business' | 'done';

const emptyAgency = (wantsSample: boolean): AgencyForm => ({
  contactName: '', email: '', orgName: '', website: '', clientCountBand: '', wantsSample, sampleBusinessName: '', sampleWebsite: '', sampleLocation: '',
});
const emptyBusiness = (): BusinessForm => ({ contactName: '', email: '', orgName: '', website: '', location: '', vertical: '', verticalOther: '' });

export function JoinDialog({ open, start, onClose, submit }: { open: boolean; start: JoinStart; onClose: () => void; submit?: JoinSubmit }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-dvh overflow-y-auto">
        {/* Mounted only while open, so each opening starts fresh from `start`. */}
        <JoinFlow start={start} onClose={onClose} submit={submit} />
      </DialogContent>
    </Dialog>
  );
}

function JoinFlow({ start, onClose, submit }: { start: JoinStart; onClose: () => void; submit?: JoinSubmit }) {
  const { pilotMode } = usePilot();
  const [step, setStep] = useState<Step>(start === 'business' ? 'business' : start === 'choose' ? 'choose' : 'agency');
  const [choice, setChoice] = useState<JoinChoice>(start === 'business' || !pilotMode ? 'business' : 'agency');
  const [agency, setAgency] = useState<AgencyForm>(() => emptyAgency(start === 'agency-sample'));
  const [business, setBusiness] = useState<BusinessForm>(emptyBusiness);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function focusFirst(found: FieldErrors, order: readonly string[]) {
    const first = order.find((k) => found[k]);
    if (first) document.getElementById(`join-${first}`)?.focus();
  }

  function back() {
    setErrors({});
    setFormError(null);
    setStep('choose');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || (step !== 'agency' && step !== 'business')) return;
    const found = step === 'agency' ? validateAgency(agency) : validateBusiness(business);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusFirst(found, step === 'agency' ? AGENCY_FIELD_ORDER : BUSINESS_FIELD_ORDER);
      return;
    }
    // TASK 8 seam: the Turnstile token and the POST live behind `submit`. Without it the form only validates.
    if (!submit) return;
    setPending(true);
    try {
      const result = await submit(step === 'agency' ? { kind: 'agency', form: agency } : { kind: 'business', form: business });
      if (result.ok) setStep('done');
      else setFormError(result.error);
    } finally {
      setPending(false);
    }
  }

  if (step === 'done') {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug">{JOIN_COPY.done.title}</DialogTitle>
          <DialogDescription>{JOIN_COPY.done.sub}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>{JOIN_COPY.done.close}</Button>
        </div>
      </>
    );
  }

  if (step === 'choose') {
    return (
      <StepChoose
        choice={choice}
        onChoice={setChoice}
        onNext={() => setStep(choice)}
        agencySignUpHref={pilotMode ? null : `${siteEnv.appUrl}/sign-up`}
      />
    );
  }

  // React 19 resets uncontrolled-looking forms after an action; every field here is controlled and the reset is cancelled anyway.
  return (
    <form noValidate onSubmit={onSubmit} onReset={(e) => e.preventDefault()} className="contents">
      {step === 'agency' ? (
        <StepAgency form={agency} errors={errors} pending={pending} formError={formError} onChange={(p) => setAgency((f) => ({ ...f, ...p }))} onBack={back} />
      ) : (
        <StepBusiness form={business} errors={errors} pending={pending} formError={formError} onChange={(p) => setBusiness((f) => ({ ...f, ...p }))} onBack={back} />
      )}
    </form>
  );
}
