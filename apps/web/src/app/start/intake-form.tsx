'use client';
import type { IntakePlaceOption, SignedIntakePlace } from '@cs/tools';
import { Button, Input } from '@cs/ui';
import Image from 'next/image';
import Script from 'next/script';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { lookupBusinessAction, type SubmitState, submitIntakeAction } from './actions';
import type { IntakeBrand } from './brand';
import { ErrorNote } from '@/components/form-error';
import { Field, INPUT_CLASS } from '@/components/onboarding/field';
import { OnboardingShell, type OnboardingBrand } from '@/components/onboarding/onboarding-shell';
import { IntakeNext } from '@/components/onboarding/previews/intake-next';
import { SnapshotTeaser } from '@/components/onboarding/previews/snapshot-teaser';
import { PreviewWindow } from '@/components/onboarding/preview-window';
import { StepFooter } from '@/components/onboarding/step-footer';
import { DuplicateHint, PlaceSummary } from '@/components/place-summary';

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: { sitekey: string }) => string; reset: (id?: string) => void; remove: (id: string) => void };
  }
}

const TEXTAREA_CLASS = 'min-h-20 w-full rounded-md border border-[#8796AB] bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
const COOLDOWN_S = 60;
const STEP_LABELS = ['Find your business', 'Your details', 'Check your email'] as const;
const TITLES = ['See how you compare with nearby rivals', 'Where should we send it?', 'Your snapshot link is on its way'] as const;

const shellBrand = (b: IntakeBrand): OnboardingBrand =>
  b.kind === 'agency' ? { kind: 'agency', name: b.displayName, logoUrl: b.logoUrl, style: b.style as React.CSSProperties } : { kind: b.kind };

interface Details { contactName: string; email: string; phone: string; message: string; consent: boolean }

/** The signed lookup result, posted back unchanged: submitIntake refuses an edited or expired one. */
const lookupJson = (p: IntakePlaceOption) => JSON.stringify({ place: p.place, exp: p.exp, sig: p.sig } satisfies SignedIntakePlace);

/**
 * Phase 16 §8: the three-step intake on the onboarding shell (Find your business, Your details, Check your email). Lead data,
 * rate limits, Turnstile and the verify flow are unchanged from 11c: step 1 finds the business on Google Maps (signed result),
 * step 2 posts the contact details through `submitIntakeAction`, step 3 resends by posting the same fields again (`submitIntake`
 * refreshes the unverified lead with a new token) after a 60 s cooldown. Every field is controlled and `onReset` is cancelled,
 * so React 19's post-action form reset never wipes what the visitor typed. The Turnstile widget loads only with a site key.
 * `preview` (the agency's settings page) stacks steps 1 and 2 in a plain box, all controls disabled.
 */
export function IntakeFlow({ brand, slug, refCode, siteKey, preview = false, privacyUrl = null }: {
  brand: IntakeBrand; slug: string | null; refCode: string | null; siteKey: string | null; preview?: boolean; privacyUrl?: string | null;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [places, setPlaces] = useState<IntakePlaceOption[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [picked, setPicked] = useState<IntakePlaceOption | null>(null);
  const [f, setF] = useState<Details>({ contactName: '', email: '', phone: '', message: '', consent: false });
  const [searching, startSearch] = useTransition();
  const [state, submit, submitting] = useActionState<SubmitState, FormData>(submitIntakeAction, { error: null, done: false });
  const [sends, setSends] = useState(0);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);
  const moved = useRef(false);

  // An accepted submit (or resend) moves to step 3 and starts the cooldown.
  useEffect(() => {
    if (!state.done) return;
    const n = Date.now();
    setStep(3);
    setSends((c) => c + 1);
    setNow(n);
    setUntil(n + COOLDOWN_S * 1000);
  }, [state]);

  // Deadline-based, so a throttled background tab still shows the true remaining time.
  useEffect(() => {
    if (until === 0) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [until]);

  // A new step lands keyboard and screen-reader users on its heading (not on first paint).
  useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    const h = document.querySelector<HTMLElement>('main h1');
    if (h) {
      h.tabIndex = -1;
      h.focus();
    }
  }, [step]);

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((o) => ({ ...o, [k]: k === 'consent' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const search = () => {
    setLookupError(null);
    setPicked(null);
    startSearch(async () => {
      const r = await lookupBusinessAction({ slug, name, location });
      if (r.ok) setPlaces(r.places);
      else {
        setPlaces(null);
        setLookupError(r.error);
      }
    });
  };

  const left = until > now ? Math.ceil((until - now) / 1000) : 0;
  const findStep = (
    <FindStep
      platform={brand.kind === 'platform'} name={name} location={location} setName={setName} setLocation={setLocation}
      places={places} picked={picked} setPicked={setPicked} lookupError={lookupError} searching={searching} onSearch={preview ? undefined : search} preview={preview}
    />
  );
  const detailsFields = (
    <DetailsFields f={f} set={set} privacyUrl={privacyUrl} siteKey={preview ? null : siteKey} state={state} preview={preview} />
  );

  if (preview) {
    return (
      <div style={brand.style as React.CSSProperties} className="flex flex-col gap-8 bg-white p-6 text-ink">
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{TITLES[0]}</h2>
          {findStep}
        </section>
        <section className="flex flex-col gap-4 border-t border-line pt-6">
          <h2 className="text-xl font-semibold">{TITLES[1]}</h2>
          {detailsFields}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled aria-disabled="true" className="self-start">Get my free snapshot</Button>
            <span className="text-sm text-muted-ink">Disabled in preview</span>
          </div>
        </section>
      </div>
    );
  }

  const who = brand.kind === 'agency' ? brand.displayName : null;
  const common = { brand: shellBrand(brand), step: { n: step, of: 3, label: STEP_LABELS[step - 1] }, title: TITLES[step - 1] };

  if (step === 1) {
    return (
      <OnboardingShell
        {...common}
        subtitle="A free snapshot from public information. No card, no sign-up."
        preview={<PreviewWindow chrome={false} width={600}><SnapshotTeaser name={picked?.place.title ?? ''} /></PreviewWindow>}
        caption={<><b className="font-semibold text-ink">Preview.</b> Your free snapshot: you against the three closest rivals.</>}
        footer={<StepFooter primary={{ label: 'Continue', form: 'intake-continue', disabled: !picked }} />}
      >
        <form id="intake-continue" onSubmit={(e) => { e.preventDefault(); if (picked) setStep(2); }} />
        {findStep}
      </OnboardingShell>
    );
  }

  if (step === 2) {
    return (
      <OnboardingShell
        {...common}
        subtitle={`We email you a link to your snapshot${picked ? ` for ${picked.place.title}` : ''}.`}
        preview={<PreviewWindow chrome={false} width={520}><IntakeNext who={who} /></PreviewWindow>}
        caption={<><b className="font-semibold text-ink">Your request</b> goes to {who ?? 'a local marketing partner'} only.</>}
        footer={<StepFooter back={() => setStep(1)} primary={{ label: 'Get my free snapshot', form: 'intake-details', pending: submitting }} />}
      >
        <form id="intake-details" action={submit} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
          {state.error && <ErrorNote focusKey={state}>{state.error}</ErrorNote>}
          <HiddenFields picked={picked} slug={slug} refCode={refCode} />
          {detailsFields}
        </form>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      {...common}
      subtitle={<>We sent it to <b className="font-semibold text-ink">{f.email}</b>. Open the email to confirm it&apos;s you and see your snapshot.</>}
      preview={<EmailAside />}
      caption={<><b className="font-semibold text-ink">Almost there.</b> The link works for 48 hours.</>}
    >
      <p className="text-sm leading-normal text-muted-ink">Didn&apos;t get it? Check your spam folder, or send it again.</p>
      <form action={submit} onReset={(e) => e.preventDefault()} className="flex flex-col gap-3">
        {state.error && <ErrorNote focusKey={state}>{state.error}</ErrorNote>}
        <HiddenFields picked={picked} slug={slug} refCode={refCode} />
        {(['contactName', 'email', 'phone', 'message'] as const).map((k) => <input key={k} type="hidden" name={k} value={f[k]} />)}
        <input type="hidden" name="consent" value="on" />
        {siteKey && <TurnstileWidget siteKey={siteKey} state={state} />}
        <div className="flex items-center gap-3.5">
          <Button type="submit" variant="outline" disabled={submitting || left > 0}>{left > 0 ? `Resend in ${left} s` : 'Resend'}</Button>
          <p role="status" className="text-[13px] text-muted-ink">{sends > 1 && left > 0 ? 'Sent again.' : left > 0 ? `You can resend in ${left} s` : ''}</p>
        </div>
      </form>
      <button type="button" onClick={() => setStep(2)} className="self-start text-sm font-medium text-secondary underline">Wrong email? Go back</button>
    </OnboardingShell>
  );
}

function HiddenFields({ picked, slug, refCode }: { picked: IntakePlaceOption | null; slug: string | null; refCode: string | null }) {
  return (
    <>
      {picked && <input type="hidden" name="lookup" value={lookupJson(picked)} />}
      <input type="hidden" name="slug" value={slug ?? ''} />
      {refCode && <input type="hidden" name="ref" value={refCode} />}
    </>
  );
}

function FindStep({ platform, name, location, setName, setLocation, places, picked, setPicked, lookupError, searching, onSearch, preview }: {
  platform: boolean; name: string; location: string; setName: (v: string) => void; setLocation: (v: string) => void;
  places: IntakePlaceOption[] | null; picked: IntakePlaceOption | null; setPicked: (p: IntakePlaceOption) => void;
  lookupError: string | null; searching: boolean; onSearch?: () => void; preview: boolean;
}) {
  return (
    <>
      {platform && <p className="text-[15px] text-muted-ink">We&apos;ll match you with a local marketing partner.</p>}
      <form
        action={onSearch}
        onSubmit={preview ? (e) => e.preventDefault() : undefined}
        onReset={(e) => e.preventDefault()}
        className="flex flex-col gap-4"
      >
        {lookupError && <ErrorNote>{lookupError}</ErrorNote>}
        <Field id="businessName" label="Business name" required>
          <Input id="businessName" name="businessName" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLASS} />
        </Field>
        <Field id="location" label="City or ZIP" required>
          <div className="grid grid-cols-[1fr_auto] gap-2.5">
            <Input id="location" name="location" required minLength={2} maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT_CLASS} />
            <Button type="submit" variant="outline" className="h-10" disabled={searching || preview} aria-disabled={preview || undefined}>{searching ? 'Searching…' : 'Search'}</Button>
          </div>
        </Field>
        {preview && <span className="text-sm text-muted-ink">Disabled in preview</span>}
      </form>

      {places && places.length === 0 && <p role="status" className="rounded-lg bg-canvas p-3 text-sm text-ink">No businesses found. Check the spelling or try a ZIP code.</p>}
      {places && places.some((o) => o.possibleDuplicate) && <DuplicateHint />}
      {places && places.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Matching businesses">
          {places.map((signed) => {
            const p = signed.place;
            const on = picked?.place.placeId === p.placeId;
            return (
              <li key={p.placeId}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(signed)}
                  className={`flex w-full flex-col gap-1 rounded-lg border p-3.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${on ? 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-line hover:bg-canvas'}`}
                >
                  <PlaceSummary place={p} isClaimed={signed.isClaimed} possibleDuplicate={signed.possibleDuplicate} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function DetailsFields({ f, set, privacyUrl, siteKey, state, preview }: {
  f: Details; set: (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  privacyUrl: string | null; siteKey: string | null; state: SubmitState; preview: boolean;
}) {
  return (
    <>
      <Field id="contactName" label="Your name" required>
        <Input id="contactName" name="contactName" autoComplete="name" required maxLength={120} value={f.contactName} onChange={set('contactName')} className={INPUT_CLASS} disabled={preview} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="email" label="Email" required>
          <Input id="email" name="email" type="email" autoComplete="email" required maxLength={320} value={f.email} onChange={set('email')} className={INPUT_CLASS} disabled={preview} />
        </Field>
        <Field id="phone" label="Phone" optional>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} value={f.phone} onChange={set('phone')} className={INPUT_CLASS} disabled={preview} />
        </Field>
      </div>
      <Field id="message" label="What would you like help with?" optional>
        <textarea id="message" name="message" maxLength={500} className={TEXTAREA_CLASS} value={f.message} onChange={set('message')} disabled={preview} />
      </Field>
      <label className="flex items-start gap-2.5 text-sm leading-[1.45]">
        <input type="checkbox" name="consent" required checked={f.consent} onChange={set('consent')} disabled={preview} className="mt-0.5 size-4" />
        <span>
          I agree to be contacted about my request.
          {privacyUrl && (
            <>
              {' '}
              <a href={privacyUrl} className="text-secondary underline" target="_blank" rel="noreferrer">Privacy policy</a>
            </>
          )}
          <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
        </span>
      </label>
      {siteKey && <TurnstileWidget siteKey={siteKey} state={state} />}
    </>
  );
}

/** Step 3 right panel: the owner-picked illustration (spec 16 O14; decorative scene, described for assistive tech). */
function EmailAside() {
  return (
    <Image
      src="/onboarding/intake-email.webp" alt="An open envelope with a card rising out of it and a few small sparkles."
      width={800} height={800} priority className="size-[420px] rounded-xl"
    />
  );
}

/**
 * Explicit rendering: this form mounts after the visitor picks a business (and again on the resend step), when an
 * implicit-render script would already have scanned the page. The widget adds the `cf-turnstile-response` field.
 */
function TurnstileWidget({ siteKey, state }: { siteKey: string; state: SubmitState }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mount = () => {
      if (stopped) return;
      if (window.turnstile && box.current) id.current = window.turnstile.render(box.current, { sitekey: siteKey });
      else timer = setTimeout(mount, 200);
    };
    mount();
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, [siteKey]);
  // A token is single-use: after a refused or accepted submit the visitor needs a fresh check.
  useEffect(() => {
    if ((state.error || state.done) && id.current) window.turnstile?.reset(id.current);
  }, [state]);
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={box} className="cf-turnstile" data-sitekey={siteKey} />
    </>
  );
}
