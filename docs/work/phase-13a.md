# phase-13a — White-label parity (hosts, domains, MCP host, sender, voice, scrub, branding)

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13a   **Base:** main @ bccdc980
**Plan/spec:** [plan 10-17](../superpowers/plans/2026-10-17-phase-13a-white-label.md) (stale) · [spec + addendum 11-05](../superpowers/specs/2026-10-17-phase-13a-white-label-design.md) · old brief [phase-13.md](phase-13.md) (delete at merge)

## Status (overwrite)
Plan refresh audit done, awaiting owner decisions (Q1–Q10). No code. Plan written at 0066; main at 0110.

## Next (overwrite)
Owner answers Q1–Q10 → agent rewrites the plan(s) (lean, ≤ 80 KB each) → owner approval → SDD.

## Interfaces this branch adds or changes
Migrations next free at execution, currently **0111+**. Tables `agency_domain`, `agency_sending_domain`; `agency.host_slug`; `client.voice_override`; `brief`/`alert` `review_reason`/`review_terms`. Env `NEUTRAL_DOMAIN`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `POSTMARK_ACCOUNT_TOKEN`, `DOMAINS_FAKE_VENDORS` (E2E).

## Assumes from other branches
None in flight. Plan "Dependencies on in-flight work" all satisfied (13b, 11, 10, 15a–c, 16, 17, 7a–c, 18a–e merged).

## Plan refresh

### 1. Per-task drift
| Task | Verdict | Fix to the plan |
|---|---|---|
| Global | superseded | "Runs on main, no worktree" → this worktree/branch; migrations 0111+; E2E host port = `E2E_PORT` (3101 here), not 3100. Add constraints: ≤ 8 DB stages (also on an agency host), `ISOLATION_FIXTURES` per tool, `TABLE_CLASS`+world rows per table, SSRF guard, help key + guide per page, `copy:review`, `previews.ts` per template. |
| 0 | grows | Scan list += `authBranding` (`server/branding.ts`), `themeForViewer`/`agencyBrandingOf` (`server/theme.ts`), `displayNameFor` (@cs/mcp), `mcpServerName`, `briefAttachment`, `tools/src/intake/emails.ts`, `tools/src/tools/client-details.ts`. `auth` importers = 12 (new `sign-in/check-email/actions.ts`); `insert(agency)` = 15 sites (P1 trigger still right). Owner asks → Q10. |
| 1 | grows | 0111 generated / 0112 `hosts_rls` (pattern `0066_onboarding_rls.sql` ok). Both tables `tenant_agency` in `packages/db/test/table-classes.ts` + rows in `test/isolation-world.ts`; `rls-sweep isolation-world` in Done-when. Backfill → Q4. |
| 2 | valid + grows | `agencyByHostname`/`clientOriginFor` filter `agency.archived_at IS NULL`. Fake guard → Q8. |
| 3 | grows | Keep `createEmailSender`'s new `attachment` (brief PDF). Classify ~10 `delivery?.fromAddress ?? env.EMAIL_FROM` sites in `apps/worker/src/deps.ts` (client: `sendClient`). Web senders: `server/{auth,invite-email,support-email,tools}.ts` (`leadEmail`), `app/start/actions.ts` (intake `lead_*` = client audience when the lead has an agency). `updateAgencyBranding` still drops `fromEmail`. |
| 4 | grows | `proxy.ts` is sync → async. Agency-host deny += `/api/postmark`, `/api/waitlist`, `/api/site-status`, `/waitlist`, `/sample`, `/start` (pool; `/start/<slug>`/`v`/`verify` only for the host agency). Keep `/api/ask/turn`, `/files/{evidence,rank-map,brief,report}/*`, `/c/<id>/setup/*` (owner pick). Logo rule must allow `/files/logo/clients/<clientId>/` for the host agency's clients. `STAFF_ONLY` must not catch `/onboarding/*.webp` (`start/intake-form.tsx`). Cache → Q2. |
| 5 | partly done | 15a: `authBranding(service, env, hint)` + `AuthCard branding: null` = neutral (drop the `neutral` prop). `hostBranding` = host agency → hint → `DEFAULT_AGENCY_ID`. `defaultBranding` callers now platform-only pages (`join`, `sign-in/check-email`, `sign-up*`, `u/*`, `waitlist/confirmed`) + `theme.ts`, `auth.ts`. Keep `instrumentPgPool` under `PROFILE_TOOLS`. |
| 6 | valid + grows | Keep `resolveViewer`'s `onMembership` (launch-gate prefetch). `NO_PLATFORM_BOUNCE` += `start`, `waitlist`, `sample`, `join`, `u`, `sign-up`, `onboarding`, `bot`. Routes exist as cited. |
| 7 | grows | `appLinkFor` list (12 files) still exact. Add: intake `verifyUrl`, client logo (`client-details.ts`), worker `billing-notices.ts` client `actionUrl`, `my-billing.ts` portal, `client-billing.ts checkoutFor` (~l.355). Team invite = `(app)/agency/settings/team/actions.ts` + `access/team-invite-email.ts` (staff → APP_URL). Skip PDF logo rehost (renderer-internal); rank-map URL relative. |
| 8 | partly done | 15a `mcpServerName` (fallback `competitor-intel`) replaced `rival-monday` → drop `connectorSlug`. Pages moved to `(app)/agency/settings/ai`, `(app)/c/[clientId]/settings/ai` (URL `${appUrl}/mcp`). `resource_name: 'Rival Monday'` still there. `auth."oauthResource"` seeds per instance. Cutover → Q9. |
| 9 | valid | Patterns exist (`billing/src/fake-gateway.ts`, `collectors/src/vendors/meta-search.ts`); errors via `redactForLog`. |
| 10 | paths changed | Registry = `packages/tools/src/tools/{all,schemas,access-marks.test,channels.test}.ts`. Slug tool → `platform_set_agency_host_slug` in `tools/platform-agency.ts`. `ISOLATION_FIXTURES` (`tools/src/isolation/fixtures.ts`): domains `agency`, slug `platform`. Writes refused on hold (`suspended_*`). |
| 11 | grows | `/health` probe via SSRF guard (`assertPublicUrl`). Worker is on Railway (env there). `agency_domain_notice` → `previews.ts` + ledger. |
| 12 | paths changed | Nav = `settingsNavFor` (`nav-items.ts` ~l.218). `PageHeader` title = label (`page-titles.test.ts`), help key `page:agency.settings.domains` + `docs/help/pages/agency.settings.domains.agency.md`, design system v1, statuses in `lib/labels.ts`. |
| 13 | grows | Host helper reads `E2E_PORT`; tags `@hosts`/`@domains` new in `scripts/e2e-affected-rules.ts`. |
| 14 | valid | Work file = this file. |
| 15–17 | grows | Fixtures: `get_voice_settings`/`update_client_voice` `client`, agency voice + preview `agency`. `preview_voice` = paid AI: ledger + 7b guards, refused on hold. Writers → Q5. |
| 18 | grows | Brief pipeline changed (graded report `briefs/report.ts`, highlights, read-only lines, deterministic starting point + verified why-it-matters): re-map to `writeBrief`, `generateStartingPoint`, `recommendForMoves`, `writeAlertText`, `deliverDueBriefs`. |
| 19 | paths changed | Branding = `(app)/agency/settings/branding/*` (label already "Branding & voice"). Approvals `agency/approvals/[briefId]/review-controls.tsx`. Client page → Q3. |
| 20 | mostly done | Done: titles (`(app)/layout.tsx`, `page-titles.test.ts`), neutral error pages (`ErrorPanel`), `poweredByHeader: false`, Ask → `agency.name`, client KB "your agency". Left: favicon (`app/icon.svg` = RM mark on every host), host-aware root metadata for signed-out pages, `productNameFor` + agency `kbNamesFor` fallbacks, `support.ts` text/support email subject. P24 → Q6. |
| 21 | grows | Stripe still `agency.name` (`client-billing.ts` ~l.200). Leak list += `brief_highlights`, `brief_report`, `scorecard`, `digest`, `lead_*`, `feedback_line`; extend `app/white-label-leak.test.tsx`. |
| 22–23 | valid | Crawl must also flag `rivalmonday.app` logo URLs; `demo/src/coverage.ts` exists. |

### 2. Already done elsewhere
- Agency/neutral auth pages, `{page} · {agency}` titles, neutral error pages, connector slug, Ask fallback — 15a/15b/15c-1 (`server/branding.ts`, `components/auth-card.tsx`, `components/error-panel.tsx`, `app/white-label-leak.test.tsx`).
- `--brand-ink`, `readableTextOn`, runtime `--secondary-foreground` (`packages/ui/src/theme.ts`; BACKLOG l.212 stale), PDF cover in brand ink (`templates/report-cover.tsx`).
- Generic runbook (spec D7 "future") — phase 14 `/c/<id>/settings/runbook`. Agency intake `/start/[slug]` (11c).

### 3. New scope to fold in
- Close: l.48 *6a* connector name; l.115 *9b R18* titles. Map: l.133 *phase-11* sign-in host branding → T5; l.112 *9b M9* → T21; l.273 *5a T18* fromEmail → T3; l.424 *4b, 5a* → 13a1; l.427 *4a* → 13a2.
- l.162 "13a: agency privacy URL and agency site URL in branding (agency `/start/v` CTA link, intake privacy link); Team invite From address … → 13a neutral domain — *phase-15c2a*" → URLs T24 (13a3); From T3.
- l.166 "13a: client-visible "Rival Monday" fallbacks in MCP `serverInfo`/tool descriptions, `.well-known/oauth-protected-resource` `resource_name`, agency-facing KB `{{product}}` … support-session email subject and `support.ts` tool description — *phase-15a/15b2*" → T8 + T20.
- l.200 "13a: when white-label ships, update the site's white-label FAQ, partners page and RM compare cells — *phase-17c*" → T23 (`apps/site`, `check:facts`), after 13a1 is live.
- l.209 "Timeline preview `fill-ink` on agency `--primary` (13a) — *16f*"; l.213 "brand-aware chart check …; neutral chart-series alias …; checked Switch … — *phase-16*"; l.217 "comprehensive branding per the 13a spec addendum 2026-11-05 …; `--ink-hover` now unused — *brand-band*" → 13a3.
- Addendum → **13a3** (no infra): T24 fields (`headerColor`, `logoDarkUrl` + upload, privacy/site URLs, `brandingProblems`); T25 editor preview + floor UI (`brandInk`/`mixHex`); T26 tokens everywhere (`themeVars`, email band, PDF cover, auth strip, chart check, Switch, Timeline, drop `--ink-hover`); T27 property test, 3-theme shots 1440/390, `copy:review`.
- 13a2 adds: favicon per host; profile-gate pass on an agency host.

### 4. Open questions for the owner
1. **Split.** (a) 13a1 hosts/domains/MCP/sender → 13a2 voice/scrub/leak → 13a3 branding addendum, each own plan + merge; 13a3 may start first in a second worktree (no domain prerequisites) · (b) addendum inside 13a2 as the spec says (plan > 80 KB) · (c) 13a1 + one combined 13a2. **Rec (a).**
2. **Host cache vs "no cross-request cache".** (a) keep the 60 s hostname→agency cache as a named exception (routing data; memberships still checked per request) · (b) no cache: one indexed lookup per agency-host request (~50 ms on Neon) · (c) negative results only. **Rec (a)**, recorded under Launch gate.
3. **Client voice page.** (a) new `/c/<id>/settings/customisation` (spec D7) · (b) "Voice" section on the client Runbook settings page (phase 14 built what D7 anticipated) · (c) on Delivery. **Rec (b).**
4. **`host_slug` source.** (a) slugify `agency.name` (P1) · (b) `intake_link.slug` when present (same regex, already public), else slugify · (c) operator sets it. **Rec (b).**
5. **Voice coverage.** (a) P20 writers + `runbook_tailor` (client plays) · (b) P20 only · (c) briefs only. **Rec (a)**; preview = agency AI spend under 7b guards.
6. **`/start` (P24).** (a) drop P24: CLAUDE.md Onboarding 11 lets platform `/start` show Rival Monday; agency hosts serve only `/start/<slug>` · (b) keep neutral `/start`. **Rec (a).**
7. **Staging/rehearsal hosts.** (a) `*.staging.<neutral>` + `mcp.staging.<neutral>` · (b) second neutral domain · (c) staging without agency hosts. **Rec (a).**
8. **Fake domain vendors.** (a) refused on any `VERCEL_ENV` (like `BILLING_FAKE_GATEWAY`) · (b) production only (plan). **Rec (a).**
9. **MCP cutover (P16).** No prod deploy yet. (a) if 13a1 reaches prod with/before the first live deploy, drop the moved error + reconnect notice · (b) keep the 90-day window. **Rec (a)**, decide at 13a1 merge.
10. **Task 0 prerequisites.** Coding blocked by none (fakes, `NEUTRAL_DOMAIN=localhost`, `DOMAINS_FAKE_VENDORS=1`); needs only OK to add the six env names (`turbo.json`/`.env`) and copy approvals. **Live verification** needs: neutral domain bought, Vercel nameservers; `*.<neutral>` + `mcp.<neutral>` on the web project (+ staging, Q7); `mail.<neutral>` in Postmark (DKIM + Return-Path, approved account); Postmark account token + Vercel token/project/team ids on Vercel web + Railway worker. (a) code now on fakes, infra in parallel · (b) wait. **Rec (a).**

## Decisions (owner-approved)
Spec D1–D7, plan P1–P24 (2026-10-17), subject to Q1–Q10.

## New backlog (target → item)
- Close at merge → BACKLOG l.212 (`--secondary-foreground` literal): done in `theme.ts`.

## Owner verification steps
TBD at plan refresh.
