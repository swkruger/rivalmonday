'use client';
import type { SignedIntakePlace } from '@cs/tools';
import { Button, Input, Label } from '@cs/ui';
import Script from 'next/script';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { lookupBusinessAction, type SubmitState, submitIntakeAction } from './actions';

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: { sitekey: string }) => string; reset: (id?: string) => void; remove: (id: string) => void };
  }
}

const textareaClass = 'min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * Phase 11c §3: the two-stage intake form (one page). Stage 1 finds the business on Google Maps; stage 2 takes the contact
 * details, consent and the Turnstile check. Every field is controlled and `onReset` is cancelled, so React 19's post-action
 * form reset never wipes what the visitor typed. The Turnstile widget loads only when the server passes a site key.
 */
export function IntakeForm({ slug, refCode, siteKey }: { slug: string | null; refCode: string | null; siteKey: string | null }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [places, setPlaces] = useState<SignedIntakePlace[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SignedIntakePlace | null>(null);
  const [searching, startSearch] = useTransition();
  const [state, submit, submitting] = useActionState<SubmitState, FormData>(submitIntakeAction, { error: null, done: false });

  if (state.done) {
    return (
      <p role="status" className="rounded-lg bg-muted-surface p-4 text-ink">
        Check your email — we sent a link to confirm it.
      </p>
    );
  }

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

  return (
    <div className="flex flex-col gap-6">
      <form action={search} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4">
        {lookupError && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{lookupError}</p>}
        <div className="flex flex-col gap-2">
          <Label htmlFor="businessName">Business name</Label>
          <Input id="businessName" name="businessName" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="location">City and state, or ZIP</Label>
          <Input id="location" name="location" required minLength={2} maxLength={120} value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <Button type="submit" disabled={searching} className="self-start">{searching ? 'Searching…' : 'Find my business'}</Button>
      </form>

      {places && places.length === 0 && <p role="status" className="rounded-lg bg-muted-surface p-3 text-ink">No businesses found. Check the spelling or try a ZIP code.</p>}

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
                  className={`flex w-full flex-col gap-1 rounded-[14px] border border-muted-surface p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${on ? 'ring-2 ring-secondary' : 'hover:bg-muted-surface'}`}
                >
                  <span className="font-semibold">{p.title}</span>
                  {p.address && <span className="text-sm text-muted-foreground">{p.address}</span>}
                  {p.rating !== null && (
                    <span className="text-sm text-muted-foreground">
                      {p.rating} ★{p.votes !== null ? ` · ${p.votes.toLocaleString('en-US')} reviews` : ''}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {picked && <ContactForm key={picked.place.placeId} place={picked} slug={slug} refCode={refCode} siteKey={siteKey} state={state} submit={submit} submitting={submitting} />}
    </div>
  );
}

function ContactForm({ place, slug, refCode, siteKey, state, submit, submitting }: {
  place: SignedIntakePlace; slug: string | null; refCode: string | null; siteKey: string | null;
  state: SubmitState; submit: (fd: FormData) => void; submitting: boolean;
}) {
  const [f, setF] = useState({ contactName: '', email: '', phone: '', message: '', consent: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((o) => ({ ...o, [k]: k === 'consent' ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <form action={submit} onReset={(e) => e.preventDefault()} className="flex flex-col gap-4 border-t border-muted-surface pt-6">
      {state.error && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{state.error}</p>}
      {/* The signed lookup result, posted back unchanged: submitIntake refuses an edited or expired one. */}
      <input type="hidden" name="lookup" value={JSON.stringify(place)} />
      <input type="hidden" name="slug" value={slug ?? ''} />
      {refCode && <input type="hidden" name="ref" value={refCode} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="contactName">Your name</Label>
        <Input id="contactName" name="contactName" autoComplete="name" required maxLength={120} value={f.contactName} onChange={set('contactName')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={320} value={f.email} onChange={set('email')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} value={f.phone} onChange={set('phone')} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="message">What would you like help with? (optional)</Label>
        <textarea id="message" name="message" maxLength={500} className={textareaClass} value={f.message} onChange={set('message')} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" required checked={f.consent} onChange={set('consent')} className="mt-0.5 size-4" />
        <span>I agree to be contacted about my request.</span>
      </label>
      {siteKey && <TurnstileWidget siteKey={siteKey} state={state} />}
      <Button type="submit" disabled={submitting} className="self-start">Get my free snapshot</Button>
    </form>
  );
}

/**
 * Explicit rendering: this form mounts after the visitor picks a business (and again after a new search), when an
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
  // A token is single-use: after a refused submit the visitor needs a fresh check.
  useEffect(() => {
    if (state.error && id.current) window.turnstile?.reset(id.current);
  }, [state]);
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div ref={box} className="cf-turnstile" data-sitekey={siteKey} />
    </>
  );
}
