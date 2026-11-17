# phase-13a2 — White-label voice, scrub, leak check

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13a2   **Base:** main @ 37a4c27c
**Plan/spec:** [13a2 plan 11-16](../superpowers/plans/2026-11-16-phase-13a2-voice-scrub-leaks.md) · [spec + addendum](../superpowers/specs/2026-10-17-phase-13a-white-label-design.md) (D6–D7, Voice, Scrubbing, Testing)

## Status (overwrite)
Started 2026-11-17 (plan approved 11-16).

## Next (overwrite)
Task 0 done; run SDD from Task 1.

## Interfaces this branch adds or changes
- **Migration 0114:** `brief` and `alert` get `review_reason text CHECK IN ('banned_term')` and `review_terms jsonb`.
- **Voice:** runbook knob `knob:voice` (`knobContentSchemas`, `EffectiveRunbook.voice`); `VoiceSettings`, `DEFAULT_VOICE`, `VoiceTerm`, `effectiveVoice(agency, override)`; `findBannedTerms(text, terms)`, `voiceBlock(v)`, `loadVoice(db, clientId)` passed to `writeBrief`, `writeWhy`, recommendations, `writeAlertText`, `runbook_tailor`/`runbook_retailor`. Tool `preview_voice { clientId? } -> { text }`, `VOICE_PREVIEWS_PER_DAY = 10`, `ai.yaml` `voice_preview`, an `ISOLATION_FIXTURES` entry.
- **Scrub:** `PLATFORM_BRAND_RE = /rival[\s-]*monday|rivalmonday/i` in `@cs/core`; root `generateMetadata` host-aware via `requestHost()` (icons per Q4); `productNameFor` fallback = `resolveBranding(agency.name, branding).displayName`; Stripe product `${displayName} competitor monitoring` (existing products not renamed).

## Assumes from other branches
13a1 on `main` (hosts, `clientOriginFor`, the hosts fixture at `seed.ts:266`). 13a3 may run in parallel (see Risks).

## Decisions (owner-approved)
- **13a2 refresh (2026-11-16):** Q1 voice = structured fields only (tone preset + preferred/banned terms; D6). Q2 voice = runbook knob `knob:voice` (agency default; whole-object client override). Q3 banned term = retry once, then AM review (brief stays `ready`, no auto-send; alert `pending_review`); tailored plays keep the base. Q4 neutral favicon on every non-platform host (CLAUDE.md "never white-label" -> platform host only, at merge). Q5 leak E2E = every agency-host route from `app/**/page.tsx` minus platform-only, plus MCP sign-in/consent, headers, redirects, icon markup. Q6 Ask voice -> backlog. Q7 build from `main` after 13a1. Q8 site claim after 13a1 is live on prod. Q9 `productNameFor` + `support.ts` use the agency display name / "platform support"; agency-facing KB keeps Rival Monday. Samples agency host slug -> `samples`.
- **V11:** `/agency*` and `/platform*` on an agency host = 404, except for a staff viewer of that agency, who is bounced.

## Leak findings to cover (from the refresh)
- The radar mark and favicon are images, so the regex cannot catch them: the crawl also asserts no `data-part="monday"`/RadarMark SVG and no RM icon `link`. Favicon today = `app/icon.svg` + `favicon.ico` (RM mark) on agency and MCP hosts; root metadata is static.
- `productNameFor` fallback `'Rival Monday'` (`mcp/branding.ts:19`) feeds MCP `serverInfo`/descriptions; also `kbNamesFor` (`kb/names.ts:24`), `support.ts:133` description, the `support-session-started` subject, profile help line (`client-profile-form.tsx:135`).
- Stripe product uses `agency.name` (`client-billing.ts:200`). Leak tests exist with separate regexes; missing: shared `PLATFORM_BRAND_RE`, a sweep over every `CLIENT_KINDS` template, MCP client-role outputs without a display name, Ask templates.
- Samples agency (`'Rival Monday Samples'`, `waitlist/sample.ts:20`) gets a neutral slug or is excluded. `E2E Agency` has no `displayName` (worst case for the crawl). Allowed as is: agency-audience Rival Monday text, the Friday mascot.
- Site white-label FAQ (`pricing-page.ts:114`, `home.ts:302`, `partners.ts:64`, compare `cap-whiteLabel`, ledger rows): only after 13a1 is live on prod (Q8).
- Closures at merge: BACKLOG `13a: client-visible "Rival Monday" fallbacks`, the site white-label FAQ line, the `kbNamesFor` part, 4a voice, 9b M9. Also take the 13a2 hosts and MCP/auth items from BACKLOG § Phase 13a follow-ups.

## Risks
- Legacy-runbook clients: `effectiveRunbook` falls back to `legacy` (no knobs); `loadVoice` must read the agency runbook directly. Confirm `AiPausedError` covers agency-only scopes for `preview_voice`.
- 13a3 edits the same Branding form/jsonb (`branding-form.tsx`, `settings.ts`, `AgencyBranding`); voice in the runbook avoids conflicts.
- Retry doubles writer cost on a banned term; a flagged brief blocks auto-send. Matcher misses inflections: say so in the UI hint.
- Crawl runtime/flakiness; alert/brief ids for `--strict-routes` unseeded.

## Later sub-phases (note)
- **13a3** (own worktree): spec addendum 2026-11-05 (header colour, dark logo, tokens, chart check).

## New backlog (target -> item)
- Ask/Friday voice (`ask_assistant`, `ask_starters`): touches the guard and eval cassettes (Q6) -> Unscheduled.

## Owner verification steps
At wrap-up.

## Pre-flight drift (2026-11-17)
- **Migration 0114 confirmed free** (latest `packages/db/migrations/0113_sending_domain_unique.sql`); test DB `cs_phase_13a2_test` ready; `pnpm typecheck` green (19/19).
- **Task 14:** demo agencies are seeded in `packages/demo/src/tenancy.ts:86` (Brazos Digital, has `displayName`) and `billing.ts:27`, not `agency.ts` (`agency.ts` has `seedAgency`, no agency insert).
- **RunbookItem** is in `packages/engine/src/runbook/items.ts:21`, not `@cs/core`. `knobContentSchemas` = `items.ts:14` (keys `thresholds`, `focus_areas`, `tier_limits`; `knob:voice` not yet present); `effectiveFrom` `state.ts:78`; `copyItems` `state.ts:31`; `loadClientRunbook` `store.ts` (used `gather.ts:44`, `citation-recommendation.ts:36`).
- **`support.ts:133`** is `packages/tools/src/tools/support.ts:133` (description). Subject: `packages/email/src/templates/support-session-started.tsx:7`.
- `tools/runbooks.ts`: `get_runbook:183`, `update_runbook_item:232`, `remove_runbook_item:374`.
- Signatures (all as plan expects; `file:line`): `writeBrief(ai,scope,c,candidates,playbooks,period)` `briefs/writer.ts:143`; `buildWriterPrompt` `writer.ts:112`; `verifyDraft(ai,scope,c,candidates,draft,opts)` `verify.ts:69`; `generateBrief(deps,clientId,opts)` `generate.ts:87`, commit `:147`; `writeWhy(ai,scope,c,findings,names)` `starting-point.ts:99` (call `:291`); `recommendForMoves` `recommendations.ts:57`; `writeAlertText(deps,a,now)` `alerts/write.ts:43` (chat `:71`); `processAlert` `alerts/route.ts:82`; `notifyAm(tx,cfg,a,note,now)` `route.ts:68`; `deliverDueBriefs` `deliver.ts:134`, `isUntouched` `:120`, `notifyOverdue` `:165`; `notifyBriefOutcome` `briefs/notify.ts:14`; `applyTailoring` `runbook/tailor.ts:54`, `tailorClientRunbook` `:133`, `proposeTailoring` `:201` (retailor call `:216`).
- `productNameFor(service, agencyId)` `packages/mcp/src/branding.ts:18`; fallback `DEFAULT_PRODUCT_NAME` `branding.ts:4`. Ask `brandingFor` `packages/ask/src/turn.ts:95` already falls back displayName -> `agency.name` -> default. `kbNamesFor` `packages/tools/src/kb/names.ts` (client-facing neutral already).
- Web: `app/icon.svg` + `app/favicon.ico` exist; `public/` has no `brand/` or `neutral-icon.svg`. Root `layout.tsx:16` static `metadata`. `proxy.ts:11` `PUBLIC` (has `/favicon`, `/icon.svg`), matcher `:79`. `hosts.ts:44` `MCP_ALLOWED`, `:47` `AGENCY_HOST_DENY` (denies `/sign-up|join|support|u|bot|waitlist|sample|start`, not `/agency`/`/platform`; V11 is new).
- `ensureConnectedProduct` `client-billing.ts:198` (name `${a?.name ?? 'Agency'} competitor monitoring` `:201`; select only `agency.name`, needs `branding`). `ensureSampleAgency` `waitlist/sample.ts:28`; name const `:20`.
- `e2e/seed.ts`: E2E Agency `:22` (branding `{primary}` only), hosts fixture `:266`, `ASK_USER_EMAIL` `:479`. `routeOfPageDir` `apps/web/scripts/profile-args.ts:141`.
- Leak regexes: ~20 `*.test.*` files (site, web help/consent, `c/[clientId]/settings/billing/brand-leak.test.tsx`).
- Already done, confirmed: `(app)` title template, neutral `not-found`/`error`/`global-error`, `poweredByHeader:false`, no `resource_name`, profile help line, `kbNamesFor` neutral. PDF creator = agency: not found by grep (check in Task 13).
