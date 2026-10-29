'use client';

import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@cs/ui';
import { useEffect, useRef, useState } from 'react';
import { siteEnv } from '../../lib/env';
import type { SubmitResult } from '../../lib/waitlist-submit';
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
import { TurnstileWidget } from './turnstile-widget';

/** What a validated step 2 hands to the submit seam. */
export type JoinSubmission = { kind: 'agency'; form: AgencyForm } | { kind: 'business'; form: BusinessForm };
/**
 * POSTs the submission with a single-use Turnstile token (`'no-widget'` without a site key). `{ ok: true }` shows the
 * uniform done screen (new, duplicate and rate-limited alike); a failure reason maps to a message above the submit row.
 */
export type JoinSubmit = (input: JoinSubmission, turnstileToken: string) => Promise<SubmitResult>;

const FAILURE_COPY = { check: JOIN_COPY.check, invalid: JOIN_COPY.invalid, unavailable: JOIN_COPY.unavailable } as const;

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
  const [stepState, setStep] = useState<Step>(start === 'business' ? 'business' : start === 'choose' ? 'choose' : 'agency');
  const [choiceState, setChoice] = useState<JoinChoice>(start === 'business' ? 'business' : 'agency');
  // Read live from the pilot context: with the pilot off the agency form is never shown (its option is the sign-up link).
  const step: Step = !pilotMode && stepState === 'agency' ? 'choose' : stepState;
  const choice: JoinChoice = pilotMode ? choiceState : 'business';
  const [agency, setAgency] = useState<AgencyForm>(() => emptyAgency(start === 'agency-sample'));
  const [business, setBusiness] = useState<BusinessForm>(emptyBusiness);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Read at render, not module load, so the key is whatever the build inlined.
  const siteKey = siteEnv.turnstileSiteKey;
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  // The script failed to load: say so, and remount the widget (fresh load) on the next attempt.
  const [widgetFailed, setWidgetFailed] = useState(false);
  const [widgetMount, setWidgetMount] = useState(0);
  // Blocks a second submit before `pending` has re-rendered the button.
  const inFlight = useRef(false);

  // Move focus to the new step's heading on every step change (not on the first render: Radix focuses the dialog itself).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    document.querySelector<HTMLElement>('[data-slot="dialog-title"]')?.focus();
  }, [step]);

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
    if (inFlight.current || pending || (step !== 'agency' && step !== 'business')) return;
    if (!validate()) return;
    if (!submit) return;
    if (!token) {
      if (widgetFailed) {
        setWidgetFailed(false);
        setWidgetMount((n) => n + 1);
        setFormError(JOIN_COPY.unavailable);
      } else {
        setFormError(JOIN_COPY.stillChecking);
      }
      return;
    }
    inFlight.current = true;
    setPending(true);
    let result: SubmitResult | null = null;
    try {
      result = await submit(step === 'agency' ? { kind: 'agency', form: agency } : { kind: 'business', form: business }, token);
    } catch {
      result = null;
    } finally {
      // The token is single-use whatever happened: clear it and get a fresh one.
      setToken(null);
      setResetKey((n) => n + 1);
      inFlight.current = false;
      setPending(false);
    }
    if (!result) setFormError(JOIN_COPY.submitFailed);
    else if (result.ok) setStep('done');
    else {
      if (result.reason === 'invalid') validate();
      setFormError(FAILURE_COPY[result.reason]);
    }
  }

  /** Runs the step's validation, shows the errors and focuses the first; true when the form is valid. */
  function validate(): boolean {
    const found = step === 'agency' ? validateAgency(agency) : validateBusiness(business);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length === 0) return true;
    focusFirst(found, step === 'agency' ? AGENCY_FIELD_ORDER : BUSINESS_FIELD_ORDER);
    return false;
  }

  if (step === 'done') {
    return (
      <>
        <DialogHeader>
          <DialogTitle tabIndex={-1} className="text-lg leading-snug outline-none">{JOIN_COPY.done.title}</DialogTitle>
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

  const turnstile = (
    <TurnstileWidget key={widgetMount} siteKey={siteKey} onToken={setToken} resetKey={resetKey} onUnavailable={() => setWidgetFailed(true)} />
  );

  // React 19 resets uncontrolled-looking forms after an action; every field here is controlled and the reset is cancelled anyway.
  return (
    <form noValidate onSubmit={onSubmit} onReset={(e) => e.preventDefault()} className="contents">
      {step === 'agency' ? (
        <StepAgency form={agency} errors={errors} pending={pending} formError={formError} turnstile={turnstile} onChange={(p) => setAgency((f) => ({ ...f, ...p }))} onBack={back} />
      ) : (
        <StepBusiness form={business} errors={errors} pending={pending} formError={formError} turnstile={turnstile} onChange={(p) => setBusiness((f) => ({ ...f, ...p }))} onBack={back} />
      )}
    </form>
  );
}
