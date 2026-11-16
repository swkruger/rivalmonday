# phase-13a2 — White-label voice, scrub, leak check

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13a2   **Base:** main after 13a1 merge
**Plan/spec:** [13a2 plan 11-16](../superpowers/plans/2026-11-16-phase-13a2-voice-scrub-leaks.md) · [spec + addendum](../superpowers/specs/2026-10-17-phase-13a-white-label-design.md) (D6–D7, Voice, Scrubbing, Testing)

## Status (overwrite)
Planned; plan owner-approved 2026-11-16; execution not started.

## Next (overwrite)
Agent: create the worktree `phase-13a2` from `main`, then run SDD from Task 0 of the plan (pre-flight: re-check migration 0114 is free).

## Interfaces this branch adds or changes
- **Migration 0114:** `brief` and `alert` get `review_reason text CHECK IN ('banned_term')` and `review_terms jsonb`.
- **Voice:** runbook knob `knob:voice` (`knobContentSchemas`, `EffectiveRunbook.voice`); `VoiceSettings`, `DEFAULT_VOICE`, `VoiceTerm`, `effectiveVoice(agency, override)`; `findBannedTerms(text, terms)`, `voiceBlock(v)`, `loadVoice(db, clientId)` passed to `writeBrief`, `writeWhy`, recommendations, `writeAlertText`, `runbook_tailor`/`runbook_retailor`. Tool `preview_voice { clientId? } -> { text }`, `VOICE_PREVIEWS_PER_DAY = 10`, `ai.yaml` `voice_preview`, an `ISOLATION_FIXTURES` entry.
- **Scrub:** `PLATFORM_BRAND_RE = /rival[\s-]*monday|rivalmonday/i` in `@cs/core`; root `generateMetadata` host-aware via `requestHost()` (icons per Q4); `productNameFor` fallback = `resolveBranding(agency.name, branding).displayName`; Stripe product `${displayName} competitor monitoring` (existing products not renamed).

## Assumes from other branches
13a1 on `main` (hosts, `clientOriginFor`, the hosts fixture at `seed.ts:266`). 13a3 may run in parallel (see Risks).

## Decisions (owner-approved)
- **13a2 refresh (2026-11-16):** Q1 voice = structured fields only (tone preset + preferred/banned terms; D6). Q2 voice = runbook knob `knob:voice` (agency default on the agency Runbook, whole-object client override on the client Runbook; amends spec "Branding -> Voice"). Q3 banned term = retry once, then AM review (brief stays `ready`, no auto-send; alert `pending_review`); tailored plays keep the base. Q4 neutral favicon on every non-platform host (CLAUDE.md "never white-label" becomes platform host only, at 13a2 merge). Q5 leak E2E = every agency-host route derived from `app/**/page.tsx` minus platform-only, plus MCP sign-in/consent, headers, redirects, icon markup. Q6 Ask voice goes to backlog. Q7 13a1 merged first; 13a2 builds from `main`. Q8 site claim after 13a1 is live on prod (small site change). Q9 `productNameFor` + `support.ts` use the agency display name / "platform support"; agency-facing KB keeps Rival Monday. Agent's call: rename the samples agency host slug to a neutral one (`samples`).
- **V11:** `/agency*` and `/platform*` on an agency host = 404, except for a staff viewer of that agency, who is bounced.

## Leak findings to cover (from the refresh)
- The radar mark and favicon are images, so the regex cannot catch them: the crawl also asserts no `data-part="monday"`/RadarMark SVG and no RM icon `link`. Favicon today = `app/icon.svg` + `favicon.ico` (RM mark) on agency and MCP hosts; root metadata is static.
- `productNameFor` fallback `'Rival Monday'` (`mcp/branding.ts:19`) feeds MCP `serverInfo`/descriptions; also `kbNamesFor` (`kb/names.ts:24`), `support.ts:133` description, the `support-session-started` subject, profile help line (`client-profile-form.tsx:135`).
- Stripe product uses `agency.name` (`client-billing.ts:200`). Leak tests exist with separate regexes; missing: shared `PLATFORM_BRAND_RE`, a sweep over every `CLIENT_KINDS` template, MCP client-role outputs without a display name, Ask templates.
- Samples agency (`'Rival Monday Samples'`, `waitlist/sample.ts:20`) gets a neutral slug or is excluded. `E2E Agency` has no `displayName` (worst case for the crawl). Allowed as is: agency-audience Rival Monday text, the Friday mascot.
- Site white-label FAQ (BACKLOG): `pricing-page.ts:114`, `home.ts:302`, `partners.ts:64`, compare `cap-whiteLabel`, plus ledger rows; only after 13a1 is live on prod (Q8).
- Closures at merge: BACKLOG `13a: client-visible "Rival Monday" fallbacks`, the site white-label FAQ line, the `kbNamesFor` part, 4a voice, 9b M9. Also take the 13a2 hosts and MCP/auth items from BACKLOG § Phase 13a follow-ups.

## Risks
- Legacy-runbook clients: `effectiveRunbook` falls back to `legacy` (no knobs); `loadVoice` must read the agency runbook directly. Confirm `AiPausedError` covers agency-only scopes for `preview_voice` (R5, 7b).
- 13a3 edits the same Branding form and jsonb (`headerColor`, dark logo): expect conflicts in `branding-form.tsx`, `settings.ts`, `AgencyBranding`. Voice in the runbook avoids them.
- The retry doubles writer cost when a term appears; a flagged brief blocks auto-send, so the client may miss Monday. The matcher misses inflections ("cheap" vs "cheaper"): say so in the UI hint.
- Crawl runtime and flakiness; alert/brief ids for `--strict-routes` are still unseeded.

## Later sub-phases (note)
- **13a3** (any time, own worktree): spec addendum 2026-11-05 (header colour, dark logo, editor preview, tokens everywhere incl. BACKLOG agency privacy/site URLs, brand-aware chart check, `--ink-hover` cleanup; property test; 3-theme shots).
- 13a2 plans earlier had "Later sub-phases" text: voice (R3/R5, AM review flags), scrub (favicon per host F24, host-aware root metadata, `productNameFor`/`kbNamesFor` fallbacks, `support.ts`, Stripe product name), leak check (unit + E2E crawl), `apps/site` white-label FAQ.

## New backlog (target -> item)
- Ask/Friday voice (`ask_assistant`, `ask_starters`): touches the guard and eval cassettes (Q6) -> Unscheduled.

## Owner verification steps
To be written at wrap-up.
