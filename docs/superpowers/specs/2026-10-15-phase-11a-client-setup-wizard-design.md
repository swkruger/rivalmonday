# Phase 11a — Client setup wizard (lookup, AI prefill, resumable setup) — design

**Status:** draft for owner review, 2026-10-15. **Branch:** `phase-11`. **Brief:** `docs/work/phase-11.md`.
New decisions and interfaces only; the core spec (`2026-09-29-core-platform-design.md`) is referenced by §.

## 1. Scope and split

Roadmap row 11 ("Multi-day GBP + DataForSEO prefill, competitor review emails, agency CC'd, billing") is split:

| Sub-phase | Content |
|---|---|
| **11a (this spec)** | Business lookup + prefill, AI profile suggestions, resumable setup wizard (profile → search → pick competitors), client-owner participation, starting-point clock change, AM reminders. |
| 11b | Invite-client-owner step, competitor-review email with agency CC, billing step (per-client price at enable time, 9b M5). Own brainstorm. |
| 11c | Client self-start: agency intake links/embeds (agency approves), platform lead pool with manual assignment in `/platform`. Own brainstorm. Automatic lead routing → backlog. |

Core spec §4.1 (onboarding flow) is the baseline; this spec makes it a guided, resumable flow.

## 2. Decisions (owner-approved 2026-10-15)

- **D1 Split** 11a / 11b / 11c as above.
- **D2 Who runs it:** agency staff and the client owner can both run the wizard. Staff always do the lookup + client creation; the client owner (invited via existing `invite_member` in 11a) continues from the profile step.
- **D3 Routes:** `/agency/clients/new` becomes the lookup step; the remaining steps live at `/c/[clientId]/setup`, shared by staff and the client owner. Phase 10's `/onboarding` stays agency-only; its `first_client` checklist item links to `/agency/clients/new`.
- **D4 Prospects** run the same wizard and stop after "Pick competitors"; 11b's invite/billing steps appear after `convert_prospect`.
- **D5 Lookup source:** DataForSEO Google Maps search (no new vendor). Lookup cost goes on the **agency** ledger (no client yet).
- **D6 Prefill:** vertical pack defaults plus **AI suggestions** (services, keywords) from vendor GBP data now; the client's website becomes a second source once `WEB_MONITORING_ENABLED` is on (same code path, website source off until then). Every suggestion carries a quote found in the source text (*no evidence, no claim*).
- **D7 Multi-day:** progress card + reminder emails to agency staff; no client-facing reminders in 11a.
- **D8 Starting-point clock** starts when competitors are done (picked or skipped), capped at 14 days after activation.
- **D9 Client-owner rights during setup:** while setup is open the client owner may edit the profile and accept/dismiss competitor suggestions regardless of `manage_competitors`; after completion the normal flags apply. Changes are attributed and reported to agency staff.
- **D10 Progress model:** step states are **derived** from existing data; a small `client_setup` table stores only what cannot be derived.
- **D11 Self-registration (11c)** amends Phase 10 f3 for clients only, and only through an agency intake link or a platform operator's manual assignment. Open for 11c: neutral brand for a platform-site sign-up (nothing client-facing names Rival Monday).

## 3. Data

New table `client_setup` (migration = next free number at execution time; RLS policy mirrors `client`'s agency tenancy; client-role reads limited to own client like other client-scoped tables).

```sql
CREATE TABLE client_setup (
  client_id          uuid PRIMARY KEY REFERENCES client(id) ON DELETE CASCADE,
  agency_id          uuid NOT NULL REFERENCES agency(id) ON DELETE CASCADE,
  source             text NOT NULL DEFAULT 'staff'
                     CHECK (source IN ('staff','agency_link','platform_lead')),
  lookup             jsonb,          -- SetupLookup, null when "can't find it"
  suggestions        jsonb NOT NULL DEFAULT '{"status":"none"}',  -- SetupSuggestions
  skipped            text[] NOT NULL DEFAULT '{}',   -- subset of {'search','competitors'}
  competitors_done_at timestamptz,   -- "Done picking" or skip
  completed_at       timestamptz,
  dismissed_at       timestamptz,    -- agency staff only
  last_changed_by    uuid,           -- auth user id
  last_changed_role  text,
  last_changed_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- Backfill: one row per existing client with completed_at = now().
```

A client **without** a row is treated as setup complete (old clients, tests).

```ts
type SetupLookup = { placeId: string; cid: string | null; title: string; address: string | null;
  category: string | null; phone: string | null; domain: string | null;
  rating: number | null; votes: number | null; lat: number; lng: number };
type SetupSuggestion = { value: string; quote: string };       // value = pack service id or keyword
type SetupSuggestions =
  | { status: 'none' | 'pending' | 'failed' }
  | { status: 'ready'; services: SetupSuggestion[]; keywords: SetupSuggestion[];
      sources: ('gbp' | 'reviews' | 'website')[]; generatedAt: string };
```

## 4. Derived step state

`getSetupState(db, clientId): SetupState` in `@cs/tools` (shared by tools, page, reminders, readiness):

```ts
type StepStatus = 'todo' | 'running' | 'done' | 'skipped' | 'blocked';
type SetupState = { open: boolean;             // row exists, completed_at and dismissed_at null
  steps: { profile: StepStatus; search: StepStatus; competitors: StepStatus };
  searchRefusal: RivalSearchRefusal | null;    // from discovery_run / startCompetitorSearch reasons
  waitingOn: 'agency' | 'client' | 'system' | null };
```
- **profile** `done` ⇔ keywords > 0 ∧ service area ∧ place id (the `startFirstAutoSearch` rule).
- **search** from latest `discovery_run`: none → `todo`, queued/running → `running`, finished → `done`, refused/failed → `blocked`; `skipped` if in `skipped`.
- **competitors** `done` ⇔ `competitors_done_at` set and not skipped; `skipped` if skipped.
- When profile, search and competitors are each done or skipped, the write that caused it sets `completed_at` (same transaction).

## 5. Step 1 — lookup (`/agency/clients/new`)

- **Tool `find_business`** — `access: 'read'`, `permission: 'agency'`, requires `clientScope === 'all'`.
  Input `{ name: string(1..120), location: string(2..120) }` (city + state or ZIP). Output `{ places: SetupLookup[] }` (≤ 5) | refusal `daily_cap`.
  One call to a new collector `mapsSearchByText(dfs, { keyword: \`${name} ${location}\`, locationName: 'United States', depth: 10 }, scope)` on `/serp/google/maps/live/advanced` (reuse `parseMapsItems`). Scope `{ agencyId, clientId: null }`. Cap **30 lookups / agency / UTC day**, counted from `vendor_call` rows (operation `maps_search_text`).
- **Vertical preselect:** GBP category (+ additional categories) matched case-insensitively against each pack's `discovery.categories` then `related_categories`; first match wins; none → staff choose.
- **"Can't find it?"** shows today's `ClientProfileForm` (manual place id optional); `client_setup.lookup = null`.
- **`create_client` gains optional `lookup: SetupLookup`.** With it: name = title (editable), `placeId`, `serviceArea = { center: {lat,lng}, radiusKm: 15, zips: [] }`, **keywords `[]`** (so the auto search waits for the profile step), creates `client_setup` (source `staff`, `suggestions.status = 'pending'`), enqueues `setup-suggestions` after commit, returns the client id; the page redirects to `/c/[id]/setup`. Without `lookup`: today's behaviour plus a `client_setup` row with `lookup = null`, `suggestions.status = 'none'`.

## 6. AI suggestions job

Worker job **`setup-suggestions`** `{ clientId }` (no-op in DEMO/TEST env, skip if client not active/prospect or `agencyServiceable` false; idempotent: only runs when status is `pending`).
1. `collectGbpProfile` — change: take a real `CallScope` (today hard-coded null) and also parse `description`.
2. Source text: description, categories, GBP services, attributes, up to 10 most recent review snippets. All through `redactForModel(text, { businessNames })`.
3. AI task **`setup_suggestions`** in `packages/ai/config/ai.yaml` (Sonnet 4.6, fallback Haiku 4.5, JSON schema, temperature 0.2). Prompt lists the pack's service ids + names and asks for services and ≤ 5 keywords, each with a verbatim quote.
4. Validation (deterministic, in code): drop service ids not in the pack; drop any item whose `quote` is not a case-insensitive substring of the source text; keywords may instead be `<accepted service name> <city>` with the service's quote; de-duplicate; cap keywords at `MAX_KEYWORDS` (5).
5. Store `{ status: 'ready', … }`; on vendor/AI failure `{ status: 'failed' }` (UI falls back to the pack's `seed_keywords`). Cost scope `{ agencyId, clientId }`.
6. Website source: a `sources` slot `website` read through the polite crawler, enabled only when `WEB_MONITORING_ENABLED` is set; off in 11a.

## 7. Wizard page `/c/[clientId]/setup`

Visible to agency staff with `canAccessClient` and the client's `client_owner`; anyone else (and any client once setup is not open, for client roles) → 404. Staff can still open a completed/dismissed setup read-only.
- Stepper: **Your business → Finding competitors → Pick competitors** (11b appends steps for clients, not prospects).
- **Your business:** `ClientProfileForm` prefilled; suggestions shown as pre-ticked chips with their quote on hover/tap; polls `get_client_setup` while `suggestions.status = 'pending'` (pattern: `useSearchProgress` in `competitors/competitor-controls.tsx`).
- **Finding competitors:** progress (poll), "You can leave — we'll email you when suggestions are ready" (staff copy; client-owner copy omits the email promise). Refusals in plain words + **Skip**.
- **Pick competitors:** tiered suggestions (Top rival / Worth watching / Minor), top rivals pre-ticked (Phase 12 D5); **Done picking** or **Skip**.
- Not forced: the client overview and agency client list show a **"Finish setup · n of 3"** card/badge linking to the wizard while `open`.
- New screens registered in `packages/demo/src/coverage.ts`.

## 8. Tools

All registered in `@cs/tools`; web writes via `runTool`.

| Tool | access / permission | Input → output | Rules |
|---|---|---|---|
| `find_business` | read / agency | §5 | §5 |
| `get_client_setup` | read / read | `{clientId}` → `{ state: SetupState, lookup, suggestions, search, competitorSuggestions: ClientSafeSuggestion[] }` | `ClientSafeSuggestion` = id, name, tier, rating, votes, distanceKm, preTicked — **no internal fields** (`overlap_score`, `signals`, `ad_matches`, `appearances`, `best_rank`) |
| `save_setup_profile` | write / manage | `{clientId, services?, keywords?, serviceArea?, placeId?}` → `{ state }` | Same validation + auto-search trigger as `update_client_profile` (extract a shared `applyClientProfileChange`). Client owner only while `open`. Sets `last_changed_*`. |
| `pick_setup_competitors` | write / manage | `{clientId, accept: uuid[], dismiss: uuid[]}` → `{ state }` | Reuses accept/dismiss service logic; client owner allowed while `open` regardless of `manage_competitors`. |
| `advance_client_setup` | write / manage | `{clientId, action: 'confirm_competitors'\|'skip_search'\|'skip_competitors'\|'dismiss'}` → `{ state }` | `dismiss` agency roles only. Sets `competitors_done_at` on confirm/skip-competitors; `completed_at` when all done/skipped. |

The feature bypass in D9 is implemented inside these tools (registry still checks `permission: 'manage'`, which client owners hold); the registry's feature rule is unchanged.

## 9. Starting-point clock

New helper `startingPointClockStart(client, setup): Date | null` used by `engine/src/briefs/readiness.ts` (:51) and `starting-point.ts` (:177):
- no setup row, or `completed_at` set → `activated_at ?? created_at` (today);
- open → `competitors_done_at ?? dismissed_at`;
- null → not due **unless** `activated_at + 14 days` has passed, then the normal 48 h rule from `activated_at`.

## 10. Reminders

Worker job **`setup-reminders`**, daily 14:00 UTC (registered in `main.ts`; skipped on DEMO/TEST). Open setups of clients with status `active` or `prospect`, `agencyServiceable` true. Recipients: `recipientsFor(db, { agencyId, clientId, kind, audience: 'agency' })` (agency contacts whose scope includes the client). Via the `notification` outbox with dedupe keys:

| Kind | When | Dedupe key |
|---|---|---|
| `setup_suggestions_ready` | competitor suggestions exist, step 3 not done | `setup-ready:<clientId>` (once) |
| `setup_client_changed` | `last_changed_role` is a client role and changed since last send | `setup-client:<clientId>:<yyyy-mm-dd>` |
| `setup_idle` | `waitingOn = 'agency'` and no change for 3 or 7 days | `setup-idle:<clientId>:3` / `:7` |

Email templates in `@cs/email` (platform-branded agency mail, like Phase 10's agency emails). Copy drafted by the implementer, owner signs off.

## 11. Tests

- Unit: `getSetupState` matrix; suggestion validation (unknown ids, quote not in source, keyword cap); clock helper incl. 14-day cap; `find_business` daily cap + agency-only ledger scope; client-owner writes refused after completion/dismissal; `dismiss` refused for client roles; `get_client_setup` payload has no `upsell_tag`; RLS isolation for `client_setup`; reminder dedupe.
- E2E (fake DataForSEO + `ASK_FAKE_AI`-style fake): staff lookup → create → profile → search → pick → complete; client owner edits during setup, gets 404 after completion.
- Demo: `pnpm demo:reset` seeds one client mid-setup (suggestions ready, waiting at "Pick competitors").

## 12. Out of scope (11a)

Invite step, competitor-review email + CC, billing step (11b); intake links, lead pool (11c); automatic lead routing (backlog); website as suggestion source until `WEB_MONITORING_ENABLED`; keyword search volumes.
