# Phase 13a — White-label parity (design)

**Date:** 2026-10-17 · **Status:** owner-approved design, spec awaiting review · **Brief:** `docs/work/phase-13.md`
**Builds on:** core spec §2.2 (white-label), §5.1 (branding, voice), §8.3–8.4 (MCP, OAuth), §9.2/§9.4 (delivery, email); feasibility §6.2 B5–B9, B11. Root `CLAUDE.md`: *nothing client-facing names Rival Monday*. This spec records **new decisions and interfaces only**.

## Goal
An agency can resell the product with no visible trace of Rival Monday: its own web address, its own email domain, its own voice in briefs, and no leaks in titles, PDFs, Stripe, MCP or error pages.

## Decisions (owner-approved 2026-10-17 — do not re-open)
1. **Split and order:** 13a is built after 13b and after phase-11 merges, as **13a1** (hosts, custom domains, MCP host, sending domains) then **13a2** (scrubbing, voice, leak check).
2. **Custom domains are self-serve** via the Vercel Domains API. Fallback client host `<host_slug>.<NEUTRAL_DOMAIN>` on a **neutral domain the owner buys**; `<agency>.rivalmonday.app` is never used for clients.
3. **Verification:** agency adds a CNAME (plus a TXT only if Vercel asks); a worker polls Vercel every 10 min for up to 72 h; live only when verified **and** certificate issued; email on live. **Subdomains only** (no apex).
4. **Host scope:** everything client-facing (app, sign-in, magic links, brief/alert/guest links, PDFs, logos, rank-map images) on the agency host. **MCP and its OAuth issuer on `mcp.<NEUTRAL_DOMAIN>`** for everyone. Agency staff and the platform console stay on `rivalmonday.app`.
5. **Sending domain** self-serve via the Postmark API (DKIM + Return-Path); until verified, client email comes from `<host_slug>@mail.<NEUTRAL_DOMAIN>` — **client email never uses a Rival Monday domain**. DMARC is the agency's job: we warn, never block.
6. **Voice:** agency default (tone preset + preferred/banned terms + existing sign-off) with an optional **per-client override**; no free-text prompt.
7. The generic-runbook idea (per-client playbooks instead of per-vertical packs) is a separate future phase; 13a only puts per-client voice on a **Client customisation** page it can later extend.

## Data model (migrations: next free numbers at execution time)
```sql
ALTER TABLE agency ADD COLUMN host_slug text;
-- backfill: slugify(agency.name), de-duplicated with -2, -3 …; then:
ALTER TABLE agency ALTER COLUMN host_slug SET NOT NULL,
  ADD CONSTRAINT agency_host_slug_unique UNIQUE (host_slug),
  ADD CONSTRAINT agency_host_slug_check CHECK (host_slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$' AND host_slug NOT IN ('www','mcp','mail','app','api','admin','support'));

CREATE TABLE agency_domain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
  hostname text NOT NULL,                       -- lower-case, no trailing dot
  status text NOT NULL DEFAULT 'pending',       -- pending | verifying | live | failed | removed
  dns_records jsonb NOT NULL DEFAULT '[]',      -- [{type, name, value}] as Vercel reports them
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz, live_at timestamptz, removed_at timestamptz,
  CONSTRAINT agency_domain_status_check CHECK (status IN ('pending','verifying','live','failed','removed'))
);
CREATE UNIQUE INDEX agency_domain_hostname_active ON agency_domain (hostname) WHERE status <> 'removed';
CREATE UNIQUE INDEX agency_domain_one_per_agency ON agency_domain (agency_id) WHERE status <> 'removed';

CREATE TABLE agency_sending_domain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
  domain text NOT NULL,
  local_part text NOT NULL DEFAULT 'briefs',
  postmark_domain_id bigint,
  dkim_host text, dkim_value text, return_path_host text, return_path_value text,
  status text NOT NULL DEFAULT 'pending',       -- pending | verified | failed | removed
  dmarc_ok boolean, error text,
  created_at timestamptz NOT NULL DEFAULT now(), last_checked_at timestamptz, verified_at timestamptz,
  CONSTRAINT agency_sending_domain_status_check CHECK (status IN ('pending','verified','failed','removed')),
  CONSTRAINT agency_sending_domain_local_part_check CHECK (local_part ~ '^[a-z0-9][a-z0-9._-]{0,39}$')
);
CREATE UNIQUE INDEX agency_sending_domain_one_per_agency ON agency_sending_domain (agency_id) WHERE status <> 'removed';

ALTER TABLE client ADD COLUMN voice_override jsonb;   -- null = agency default; shape = VoiceSettings (partial)
```
- RLS: both new tables ENABLE + FORCE; SELECT for `agency_id = app_agency_id()` (agency roles only, not client roles); writes service-role only (tools run them through the existing service path, like billing rows). `host_slug` is not writable by `app_user`; platform operators change it via a console tool.
- Agency voice lives in the existing branding JSON as `voice: VoiceSettings`.

## Interfaces

**Host resolution (`apps/web`)**
- `resolveHost(host: string): Promise<{ kind: 'platform' } | { kind: 'agency'; agencyId: string; canonical: boolean } | { kind: 'mcp' } | null>` — platform = `APP_URL` host; mcp = `mcp.${NEUTRAL_DOMAIN}`; agency = live `agency_domain.hostname` or `${host_slug}.${NEUTRAL_DOMAIN}`; `null` → 404. Cached 60 s per host; `localhost` subdomains supported for dev/E2E (`<slug>.localhost`).
- `proxy.ts` rules: unknown host → 404. Agency host: client-role members of that agency, guest-link sessions and public auth routes only; an agency-staff session → redirect to the same path on the platform host; any tenant object of another agency → 404. Platform host: a session whose only memberships are client roles → 308 to `clientOriginFor(agencyId)` + path. MCP host: only `/mcp`, `/oauth/*`, `/.well-known/*`, sign-in and consent.
- Better Auth: one instance per origin (memoised map), `baseURL` = request origin, `trustedOrigins` = [that origin], host-only cookies. Agency sign-in page uses that agency's branding.
- `clientOriginFor(agencyId): Promise<string>` (`@cs/core` or `@cs/db`, usable by worker + web) — `https://` + live custom hostname, else fallback host. Used by outbox links, invites, magic links, PDFs, logo and rank-map URLs, guest links. Agency-facing messages keep `APP_URL`.

**Domains (`@cs/tools`, agency admin, audited, via `runTool`)**
- `get_agency_domains` (read): `{ fallbackHost: string; custom: { hostname, status, dnsRecords, error, liveAt } | null; sending: { domain, localPart, status, dkim: {host, value}, returnPath: {host, value}, dmarcOk, error } | null }`.
- `set_custom_domain { hostname }` → validates subdomain-only (≥ 3 labels, not under `NEUTRAL_DOMAIN` or `rivalmonday.app`), adds to the Vercel project, stores records, status `pending`, enqueues `domain-verify`. `remove_custom_domain {}` → removes from Vercel, status `removed`.
- `set_sending_domain { domain, localPart? }` → creates the Postmark domain, stores DKIM/Return-Path, status `pending`, enqueues `sender-verify`. `remove_sending_domain {}`.
- Worker jobs `domain-verify { domainId }` (every 10 min ≤ 72 h → `live` + agency email, or `failed` with Vercel's message) and `sender-verify { sendingDomainId }` (every 15 min ≤ 72 h; Postmark verify DKIM + Return-Path; DNS lookup `_dmarc.<domain>` → `dmarc_ok`).
- Vendor wrappers with fakes for tests: `VercelDomains { add, remove, status }`, `PostmarkDomains { create, verifyDkim, verifyReturnPath, remove }`.

**Email sender selection (`@cs/email` / engine delivery)**
- `senderFor(agencyId, audience: 'client' | 'agency'): { from: string; replyTo?: string }` — client audience: verified sending domain → `"<displayName>" <localPart@domain>`, else `"<displayName>" <host_slug@mail.NEUTRAL_DOMAIN>`; `replyTo` = branding `fromEmail` when set. Agency audience: platform sender. Branding save keeps a stored `fromEmail` (backlog fix).

**MCP**
- MCP endpoint and OAuth issuer served only on `mcp.<NEUTRAL_DOMAIN>`; consent page neutral before sign-in, agency-branded after. Old `rivalmonday.app/mcp` returns a JSON-RPC error `"This connector moved to https://mcp.<NEUTRAL_DOMAIN>/mcp"` for 90 days. PATs keep working on the new URL; OAuth connections reconnect once (one-time notice on AI connections). `ai-connections.tsx` uses `productNameFor` instead of the hard-coded `rival-monday`.

**Voice**
```ts
type VoiceSettings = {
  tone: 'formal' | 'friendly' | 'direct';
  preferredTerms: { say: string; insteadOf: string }[]; // ≤ 20
  bannedTerms: string[];                                 // ≤ 20
};
// each term: 1–40 chars, /^[\p{L}\p{N} '\-]+$/u
```
- `effectiveVoice(agency, client) = { ...agencyVoice, ...client.voice_override }` (per field). Default `{ tone: 'friendly', preferredTerms: [], bannedTerms: [] }`.
- Tools: `update_agency_voice` (agency admin), `update_client_voice { clientId, override: Partial<VoiceSettings> | null }` (agency roles), `preview_voice { clientId? }` → one sample paragraph from fixed demo evidence; ≤ 10/agency/UTC day.
- Writers (`brief_writer`, `alert_writer`, quarterly report) receive a separate `voice` prompt block; the evidence verifier is unchanged. Post-write banned-term check (case-insensitive, word-boundary): one retry; still present → brief/alert goes to AM review with `reviewReason: 'banned_term'` and the term highlighted.
- Web: agency **Branding → Voice** section; client **Settings → Client customisation** page (voice override only, for now).

**Scrubbing (13a2)**
- Client-page `<title>` = `{page} · {displayName}`; favicon from agency logo (fallback neutral); neutral 404/error pages on agency hosts; PDF metadata (title/author/producer) = agency name; no `generator` meta or `x-powered-by`; Stripe Connect product name = `branding.displayName`; `/start` neutral until an agency is assigned. `/bot` stays Rival Monday on the platform host only (crawler honesty).
- **Leak check:** E2E crawls every client page on an agency host as a client and fails on `/rival\s?monday|rivalmonday/i` in HTML, title, headers or redirect targets; a unit test renders every client email template, the brief/report PDF metadata, MCP tool outputs and Ask templates with the same regex.

## Env (ask the owner before adding; `turbo.json` passthrough)
`NEUTRAL_DOMAIN`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `POSTMARK_ACCOUNT_TOKEN`.

## Owner tasks
Buy the neutral domain; add `*.<NEUTRAL_DOMAIN>` and `mcp.<NEUTRAL_DOMAIN>` to the Vercel project; verify `mail.<NEUTRAL_DOMAIN>` in Postmark; create the Vercel and Postmark account tokens.

## Edge cases
- Agency enters a hostname already live for another agency → refused ("This domain is already in use."). Apex domain → refused ("Use a subdomain such as intel.youragency.com.").
- Custom domain fails or is removed → links fall back to the fallback host; removal warns that links in old emails stop working.
- A user with memberships in two agencies signs in per host; the platform-host redirect applies only when every membership is a client role.
- Sending domain removed → fallback sender immediately.
- Voice override with only `bannedTerms` set inherits the agency's tone and preferred terms.

## Testing
Unit: `resolveHost` (platform/agency custom/agency fallback/mcp/unknown); `clientOriginFor`; domain and sender state machines with faked Vercel/Postmark; hostname validation; `senderFor`; `effectiveVoice`; term validation; banned-term retry → AM review; template leak scan. E2E (`<slug>.localhost`): client sign-in on agency host; staff redirected off it; client-only user redirected off the platform host; other agency's object → 404; leak crawl; domain + sending settings in each state; Client customisation page.

## Dependencies on in-flight work
phase-11: sign-in page branding by host, `/start` copy, `OutgoingEmail.cc`, profile-change refactor — re-check at pre-flight. 13b: rank-map URLs must use `clientOriginFor`.

## Out of scope
Per-domain MCP issuers; apex domains; per-client domains; free-text style prompts; generic runbook.
