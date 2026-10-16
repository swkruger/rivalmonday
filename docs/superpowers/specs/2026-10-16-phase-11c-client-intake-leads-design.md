# Phase 11c — Client self-start: intake links, free preview, platform lead pool — design

**Status:** draft for owner review, 2026-10-16. **Branch:** `phase-11`. **Builds on:** 11a (`client_setup`, `find_business`, `SetupLookup`, wizard), 11b (`inviteClientUser`, notification outbox with `contactIds`/`cc`), Phase 10 (Turnstile verifier, `ip_hash` pattern, public routes in `proxy.ts`), Phase 8 (`/platform` console, `requirePlatformOperator`, `withPlatformAudit`). New decisions and interfaces only.

## 1. Decisions (owner-approved 2026-10-16)

- **L1** A business owner can start from an **agency intake page** `/start/<slug>` (agency-branded) or the **platform intake page** `/start`. Amends Phase 10 f3 for clients: self-start always ends in an agency decision; there is no self-serve client account.
- **L2** After email verification the owner sees a **free preview**: a rating snapshot of nearby competitors plus a short **AI summary** written only from the snapshot (*no evidence, no claim*, enforced in code).
- **L3** Agencies get **one intake link** (editable slug, on/off) and link/button to it from their site; campaigns use `?ref=` (stored). No iframe or JS widget.
- **L4** The platform page is **branded Rival Monday until an agency is assigned** — an explicit, owner-approved exception to "nothing client-facing names Rival Monday", limited to `/start` and the emails sent before assignment.
- **L5** Accepting a lead creates a **prospect** with `client_setup.source = 'agency_link' | 'platform_lead'` and invites the owner (11b). Decline optionally emails the owner; a declined platform lead returns to the pool.
- **L6** Platform leads wait in a **pool**; platform operators assign them to an agency manually in `/platform/leads`. Automatic routing → backlog.
- **L7 (amends 11a D4 and 11b E4)** Prospects get the **invite step**: prospects have 4 steps (profile, search, competitors, invite); clients 5 (+ billing). `inviteClientUser` no longer refuses prospects. A prospect's client owner sees the setup wizard and the prospect's pages; prospects still get no recurring work.
- **L8** Storage is a separate `lead` table (not a client status), so unaccepted leads never touch client tables, seats or schedulers.

## 2. Data

Migrations = next free numbers at execution time; RLS in a separate `_rls.sql` migration.
```sql
CREATE TABLE intake_link (
  agency_id  uuid PRIMARY KEY REFERENCES agency(id) ON DELETE CASCADE,
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE lead (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        uuid REFERENCES agency(id) ON DELETE CASCADE,       -- null = platform pool
  source           text NOT NULL CHECK (source IN ('agency_link','platform')),
  ref              text CHECK (char_length(ref) <= 80),
  status           text NOT NULL DEFAULT 'unverified'
                   CHECK (status IN ('unverified','verified','accepted','declined','expired')),
  contact_name     text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 120),
  email            text NOT NULL CHECK (char_length(email) <= 320),
  phone            text CHECK (char_length(phone) <= 40),
  message          text CHECK (char_length(message) <= 500),
  lookup           jsonb NOT NULL,                                      -- SetupLookup (11a)
  preview          jsonb NOT NULL DEFAULT '{"status":"none"}',           -- LeadPreview
  verify_token_hash text,
  verify_expires_at timestamptz,
  view_token_hash  text,                                                -- public preview page, 30 days
  verified_at      timestamptz,
  assigned_by      uuid, assigned_at timestamptz,
  decided_by       uuid, decided_at  timestamptz,
  client_id        uuid REFERENCES client(id) ON DELETE SET NULL,
  ip_hash          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_agency_status_idx ON lead (agency_id, status, created_at DESC);
CREATE INDEX lead_pool_idx ON lead (created_at DESC) WHERE agency_id IS NULL AND status = 'verified';
CREATE UNIQUE INDEX lead_dedupe_idx ON lead (coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(email), (lookup->>'placeId'))
  WHERE status IN ('unverified','verified');
```
RLS (`_rls.sql`):
```sql
REVOKE INSERT, UPDATE, DELETE ON intake_link, lead FROM app_user;
--> statement-breakpoint
ALTER TABLE intake_link ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE intake_link FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY intake_link_select ON intake_link FOR SELECT
  USING (agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
--> statement-breakpoint
ALTER TABLE lead ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE lead FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY lead_select ON lead FOR SELECT
  USING (agency_id IS NOT NULL AND agency_id = app_agency_id() AND app_role() IN ('agency_admin','account_manager'));
```
Pool rows (`agency_id IS NULL`) are reachable only through the service role (platform tools, public intake service functions). All writes go through `deps.service`.

```ts
type LeadPreview =
  | { status: 'none' | 'pending' | 'failed' }
  | { status: 'ready'; self: { name: string; rating: number | null; votes: number | null };
      nearby: { name: string; rating: number | null; votes: number | null; distanceKm: number }[];  // ≤ 5
      facts: string[];            // deterministic sentences, e.g. "3 of 5 nearby dentists have more reviews than you."
      summary: string | null;     // AI, validated; null when dropped
      category: string; generatedAt: string };
```

## 3. Public intake (`/start`, `/start/<slug>`)

- Public routes (add to `proxy.ts` `PUBLIC`), `noindex`, Turnstile (Phase 10 verifier). Unknown or disabled slug → 404. Agency page uses `loadBranding`; platform page uses Rival Monday branding and the line "We'll match you with a local marketing partner."
- Service functions in `@cs/tools` (no session; called by server actions, like Phase 10's `startAgencySignup`), not registered tools:
  - `intakeLookup(service, { slug | null, name, location, ipHash }, now)` → `{ places: SetupLookup[] }` — same DataForSEO call as `find_business`; limits: **5 lookups / ip_hash / hour**, **50 / agency link / UTC day**, **200 / platform page / UTC day** (atomic counter table `intake_rate (key text, window_start timestamptz, count int, PRIMARY KEY (key, window_start))`, service-role only, incremented with `INSERT … ON CONFLICT DO UPDATE SET count = intake_rate.count + 1 RETURNING count`; keys `ip:<hash>` hourly, `link:<agencyId>` / `platform` daily; rows older than 2 days deleted by `leads-cleanup`). Cost scope: agency or `{ agencyId: null }`.
  - `submitIntake(service, { slug | null, lookup, contactName, email, phone?, message?, ref?, consent: true, ipHash, turnstileToken }, now)` → `{ ok: true }` always after Turnstile (no existence or dedupe leaks). Dedupe: an open lead with same (agency/pool, email, placeId) is updated (new token) instead of inserted. Sends the verification email (template `lead_verify`, agency- or platform-branded) with a single-use token (hash stored, 48 h).
  - `verifyIntake(service, token, now)` → `{ leadId, status }`: sets `verified`, clears the token, enqueues `lead-preview`, queues agency/platform notices. Expired/used token → page "This link has expired. Start again." with a link back.
- Verified page `/start/v/<leadId>?t=<view token>` shows "Building your snapshot…" then the preview (polls a public read guarded by a view token — a second random token stored hashed on the lead, `view_token_hash`, 30 days). (`view_token_hash` in §2.)

## 4. Preview job

`lead-preview` `{ leadId }` (skips in DEMO/TEST, unless the lead is a fixture; idempotent on `preview.status = 'pending'`):
1. `mapsSearch` with keyword = `lookup.category`, centred on lookup lat/lng, depth 20; drop the lead's own place id; nearest 5 with coordinates.
2. Facts (deterministic): review-count rank, rating rank, and "closest competitor is {name}, {distance} km away".
3. AI task `lead_preview_summary` (Haiku 4.5, JSON `{ summary }`, ≤ 3 sentences) given only the snapshot JSON.
4. **Validation** (code): every number in the summary (`/\d+(?:\.\d+)?/g`) must appear in the snapshot (ratings, votes, counts, distances rounded as shown); every capitalised multi-word name must match a snapshot business name; deny-list words (`best`, `guarantee`, `#1`, `number one`, `will rank`, `lawsuit`) → drop. Dropped → `summary: null`.
5. Store `ready`; on failure `failed` (page: "We couldn't build your snapshot, but {agency} has your details."). Email `lead_confirmation` with the preview (facts + summary) after `ready`/`failed`.

## 5. Agency side

- `/agency/leads` (agency_admin, account_manager with scope `all`): tabs New / Accepted / Declined; card with business, contact, ref, message, preview.
- Tools (registered): `list_leads` (read, agency) `{ status? }`; `get_lead` (read, agency); `accept_lead` (write, agency) `{ leadId, verticalId }` → `{ clientId }`; `decline_lead` (write, agency) `{ leadId, notify: boolean }`; `get_intake_link` / `update_intake_link` (agency_admin) `{ slug?, enabled? }` (slug conflict → `slug_taken`).
- `accept_lead`: only `verified` leads of the caller's agency; one transaction: `create_client` path with `status: 'prospect'`, `lookup` (11a §5), `client_setup.source = lead.source === 'platform' ? 'platform_lead' : 'agency_link'`; `lead.status = 'accepted'`, `client_id`, `decided_*`; then `inviteClientUser({ role: 'client_owner', email, name: contactName })`. Vertical preselected from `preselectVertical`, agency confirms.
- `decline_lead`: platform-sourced → back to pool (`agency_id = NULL`, `status = 'verified'`, `assigned_* = NULL`, platform notice); agency-sourced → `declined`. `notify` → `lead_declined` email (agency-branded; copy: "Thanks for your interest. {agencyName} isn't able to take on new clients in your area right now.").
- Notices: new verified agency-link lead → `lead_new` to agency admins (+ account managers with scope `all`); assigned platform lead → same.
- Settings card "Intake link" on `/agency/settings` (agency_admin): slug, enabled, copy link, copy button snippet (`<a href="{url}" …>Get your free competitor snapshot</a>`), counts (new this month / accepted).

## 6. Platform side

- `/platform/leads` (platform operator): pool list (verified, unassigned), recently assigned, declined-back.
- Tools: `list_pool_leads` (platform viewer), `assign_lead` (platform operator, `withPlatformAudit`) `{ leadId, agencyId }` — only pool leads; sets `agency_id`, `assigned_*`; agency notice `lead_new`. Agency picker shows each agency's verticals and active-client count.
- New pool lead → email to `PLATFORM_ADMIN_EMAILS` (existing var).

## 7. Retention

Daily job `leads-cleanup`: `unverified` past `verify_expires_at` → `expired`; delete `declined`/`expired` leads older than 90 days; for `accepted` leads older than 90 days null `message`, `phone`. No DEMO/TEST runs.

## 8. Changes to 11a/11b (L7) — already applied to the 11b spec and plan

- `getSetupState`: prospects → steps `profile, search, competitors, invite` (`totalSteps: 4`); clients 5.
- `inviteClientUser`: drop the prospect refusal (and its `client_not_active` copy).
- Wizard: invite step shown for prospects; billing step clients only. `convert_prospect` reopens setup when the billing step becomes due.
- Client-owner access to a prospect: confirm in pre-flight which `/c/[clientId]` pages a client role can open for a `prospect` client; the wizard must be reachable; recurring work stays off.

## 9. Templates (copy binding; implementer may add one line of context)

| Template | Brand | Subject | Core |
|---|---|---|---|
| `lead_verify` | agency / platform | "Confirm your email to see your competitor snapshot" | "Click below to confirm your email and see how {businessName} compares with nearby businesses." Button "See my snapshot" |
| `lead_confirmation` | agency / platform | "Your competitor snapshot for {businessName}" | facts list + summary; "{agencyName} will be in touch within one business day." (platform: "We'll match you with a local marketing partner and they'll be in touch.") |
| `lead_declined` | agency | "About your request, {businessName}" | §5 copy |
| `lead_new` (agency) | platform-style agency mail | "New lead: {businessName}" | business, contact, ref, link to `/agency/leads` |

## 10. Tests

- Unit: submit → verify → preview → confirmation; duplicate merge; token single-use/expiry; rate limits (IP/hour, link/day, platform/day) atomic under concurrency; `submitIntake` same response for every outcome; preview facts math; summary validation (unknown number, unknown name, deny-list → null); accept → prospect + setup source + invite (owner contact inactive); accept refused for other agency / unverified; decline platform lead → back to pool; `assign_lead` audited, refused for non-operators and for non-pool leads; RLS: agency A can't read agency B's leads or pool rows; cleanup; prospect 4-step state.
- E2E (fake lookup + fake AI): agency link → submit → verify via outbox link → preview shown → agency accepts → prospect listed, owner invite in outbox. Platform `/start` → operator assigns → agency sees the lead.

## 11. Out of scope

Automatic lead routing (backlog); iframe/JS widgets; custom domains for intake pages; paid leads.
