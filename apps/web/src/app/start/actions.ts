'use server';
import { ToolError } from '@cs/core';
import { createLedgerSink, type SetupLookup } from '@cs/db';
import { hashIp, intakeLookup, sendLeadEmail, submitIntake } from '@cs/tools';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import { activeEnvName, processGuardOn } from '@/server/dev-guard';
import { webEmailTransport } from '@/server/email-transport';
import { webEnv } from '@/server/env';
import { toolDeps } from '@/server/tools';
import { verifyTurnstile } from '@/server/turnstile';
import { REF_RE, SLUG_RE } from './params';

/**
 * Phase 11c §3: the public intake page's server actions (`/start`, `/start/<slug>`). No session; the service functions in
 * `@cs/tools` decide everything. After the Turnstile check every submit outcome is identical (same state, ≥ 400 ms) and
 * nothing here logs an email, a token or a raw IP — `submitIntake` logs its own refusal reason.
 */

export type LookupResult = { ok: true; places: SetupLookup[] } | { ok: false; error: string };
export interface SubmitState {
  error: string | null;
  done: boolean;
}

const MIN_MS = 400;
const GONE = 'This page is no longer available.';
const UNAVAILABLE = "Business search isn't available right now. Try again later.";
const RATE = 'Too many searches. Please try again in an hour.';

const text = (f: FormData, k: string) => (typeof f.get(k) === 'string' ? (f.get(k) as string) : '');
const email = z.string().trim().max(320).email();

async function clientIp(): Promise<string | null> {
  return (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}

/** `null`/'' = the platform page; anything else must look like a slug (else the caller refuses it as gone). */
function slugOf(raw: unknown): { slug: string | null } | null {
  if (raw === null || raw === undefined || raw === '') return { slug: null };
  return typeof raw === 'string' && SLUG_RE.test(raw) ? { slug: raw } : null;
}

export async function lookupBusinessAction(input: { slug: string | null; name: string; location: string }): Promise<LookupResult> {
  const s = slugOf(input?.slug);
  if (!s) return { ok: false, error: GONE };
  const ipHash = hashIp((await clientIp()) ?? 'unknown', webEnv().authSecret);
  try {
    const r = await intakeLookup(toolDeps(), { slug: s.slug, name: String(input.name ?? ''), location: String(input.location ?? ''), ipHash }, new Date());
    return 'refused' in r ? { ok: false, error: RATE } : { ok: true, places: r.places };
  } catch (e) {
    if (e instanceof ToolError) {
      if (e.code === 'invalid_input') return { ok: false, error: e.message };
      if (e.code === 'not_found') return { ok: false, error: GONE };
      return { ok: false, error: UNAVAILABLE };
    }
    console.error(`[intake] lookup failed: ${e instanceof Error ? e.name : typeof e}`);
    return { ok: false, error: UNAVAILABLE };
  }
}

function parseLookup(raw: string): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function submitIntakeAction(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const started = Date.now();
  const env = webEnv();
  const lookup = parseLookup(text(formData, 'lookup'));
  if (!lookup || typeof lookup !== 'object') return { error: 'Choose your business first.', done: false };
  const contactName = text(formData, 'contactName').trim();
  if (!contactName) return { error: 'Enter your name.', done: false };
  const address = text(formData, 'email').trim();
  if (!email.safeParse(address).success) return { error: 'Enter a valid email address.', done: false };
  if (text(formData, 'consent') !== 'on') return { error: 'Please agree to be contacted about your request.', done: false };

  const ip = await clientIp();
  // Same check as /sign-up: the real verifier needs both keys and DEV; otherwise the fake verifier accepts 'no-widget'.
  const realCheck = activeEnvName() === 'dev' && !!env.turnstile?.siteKey && !!env.turnstile?.secretKey;
  const token = text(formData, 'cf-turnstile-response') || (realCheck ? '' : 'no-widget');
  if (!(await verifyTurnstile(token, ip, { envName: activeEnvName(), turnstileSecretKey: env.turnstile?.siteKey ? env.turnstile.secretKey : undefined }))) return { error: 'Please complete the check and try again.', done: false };

  try {
    const s = slugOf(text(formData, 'slug'));
    const ref = text(formData, 'ref').trim();
    const deps = toolDeps();
    // A malformed slug gets the same page; submitIntake refuses an unknown link itself (and logs the reason word).
    const r = await submitIntake(deps, {
      slug: s ? s.slug : text(formData, 'slug'),
      lookup: lookup as SetupLookup, // validated by submitIntake (setupLookupSchema)
      contactName,
      email: address,
      phone: text(formData, 'phone').trim() || undefined,
      message: text(formData, 'message').trim() || undefined,
      ref: REF_RE.test(ref) ? ref : undefined,
      ipHash: hashIp(ip ?? 'unknown', env.authSecret),
    }, new Date());
    const send = r.send;
    if (send) {
      // After the response, so the send's latency never distinguishes an accepted request from a refused one.
      after(async () => {
        try {
          await sendLeadEmail(
            { service: deps.service, transport: webEmailTransport(processGuardOn(), process.env, createLedgerSink(deps.service)), appUrl: env.appUrl, fromAddress: env.emailFrom, platformAdmins: [...(deps.platformAdmins ?? [])] },
            send.leadId, 'verify', { verifyRaw: send.verifyRaw },
          );
        } catch (e) {
          console.error(`[intake] verify email failed: ${e instanceof Error ? e.name : typeof e}`);
        }
      });
    }
  } catch (e) {
    // Never the message: it could carry input. The visitor sees the same page either way.
    console.error(`[intake] submit failed: ${e instanceof Error ? e.name : typeof e}`);
  }

  await new Promise((r) => setTimeout(r, Math.max(0, MIN_MS - (Date.now() - started))));
  return { error: null, done: true };
}
