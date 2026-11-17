# phase-13a2 — White-label voice, scrub, leak check

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-13a2   **Base:** main @ 37a4c27c
**Plan/spec:** [13a2 plan 11-16](../superpowers/plans/2026-11-16-phase-13a2-voice-scrub-leaks.md) · [spec + addendum](../superpowers/specs/2026-10-17-phase-13a-white-label-design.md) (D6–D7, Voice, Scrubbing, Testing)

## Status (overwrite)
Tasks 0-14 built (2026-11-17). Launch gate green on both hosts. Left: final whole-branch review (`test:affected`, `e2e:affected`, `eval:replay`, Review focus 1-5, one fix wave), owner copy sign-off, then `/rm-merge` on the owner's go-ahead.

## Next (overwrite)
Controller: final review. Owner: `pnpm copy:review` (see below), then go-ahead to merge.

## Interfaces this branch adds or changes
- **Migration 0114:** `brief`/`alert` get `review_reason text CHECK IN ('banned_term')` and `review_terms jsonb`; the samples agency host slug becomes `samples`.
- **`@cs/core`:** `VoiceSettings`, `VoiceSettingsSchema`, `DEFAULT_VOICE`, `effectiveVoice`, `findBannedTerms`, `bannedTermRegex`, `enforcedTerms`; `PLATFORM_BRAND_RE`, `brandLeaks`.
- **`@cs/engine`:** runbook knob `knob:voice`; `voiceOfItems`, `loadVoice(db, clientId)`, `voiceBlock`, `withVoice`, `writeVoicePreview`. Writers use it: brief (retry once, then `ready` + flag, no auto-send), alerts (`pending_review`), recommendations (skip), tailoring (rejects).
- **Tool `preview_voice { clientId? } -> { text }`**, 10 per agency per UTC day, `ai.yaml` `voice_preview`, `ISOLATION_FIXTURES` entry. `get_runbook` returns `voice`; `get_brief_review`/alert queue return `reviewReason`/`reviewTerms`.
- **Web:** Voice section on agency and client Runbook pages; review flags in approvals and alerts (`HighlightTerms`); neutral favicon (`public/neutral-icon.svg`) on every non-platform host; `productNameFor`, Ask, support email and Connect product names use the agency display name.
- **V11 routes on agency hosts:** `/agency*`, `/onboarding*`, `/platform*` = 404, except a 307 for this agency's staff (`/platform*` is 404 for everyone); `/onboarding/start` = 404.
- **E2E:** `e2e/white-label.spec.ts` crawl over `e2e/agency-routes.ts` (agency-host routes minus platform-only, plus MCP host pages).
- **Demo:** agency voice (formal, "customers" for "clients", banned `cheap`), Lone Star own voice (direct), a flagged ready Brazos brief (`ids.briefs.flaggedBrazos`); coverage entries `(voice)` x2 and `/agency/approvals/[briefId] (banned word)`.

## Assumes from other branches
13a1 on `main` (merged 2026-11-16). 13a3 edits Branding form/jsonb only; voice lives in the runbook, so no overlap.

## Decisions (owner-approved)
- **13a2 refresh (2026-11-16):** Q1 voice = structured fields (tone + preferred/banned terms). Q2 `knob:voice`, agency default, whole-object client override. Q3 banned term = retry once, then AM review; tailored plays keep the base. Q4 neutral favicon on every non-platform host. Q5 leak E2E over every agency-host route. Q6 Ask voice -> backlog. Q7 build from `main` after 13a1. Q8 site claim after 13a1 is live. Q9 `productNameFor`/`support.ts` use the agency name / "platform support"; agency-facing KB keeps Rival Monday. Samples slug `samples`.
- **V11:** staff-only zones on agency hosts 404 for everyone else.
- **Controller rulings:** `/platform*` is 404 for everyone on agency hosts. `/onboarding*` is in the staff zone. On `AiPausedError` the brief writer fails the attempt and the alert writer falls back to the template (unchanged). Staff of another agency outside the zones keep the 13a1 307.

## Test and gate results (Task 14)
- `@cs/demo` coverage/tenancy/briefs/seed green; `pnpm --filter @cs/demo typecheck` green.
- Launch gate platform host (`profile-gate.sh --seed`): 74 of 74 routes, max 6 DB stages.
- Agency host (`e2e-agency.localhost:3100`, asker client cookie, `--filter /c/ --strict-routes`): 30 of 30 routes, max 8 (`/c/[clientId]/briefs/[briefId]`, at the limit).
- `pnpm copy:status`: 90 unsigned in app-client, 14 app-agency, 30 app-platform, 76 app-shared, 37 help, 5 guides, 2 glossary, 42 labels, 5 emails, 1 site, 65 mcp-tools (unsigned counts include strings from earlier phases).

## New backlog (target -> item)
- Ask/Friday voice (`ask_assistant`, `ask_starters`): guard and eval cassettes (Q6) -> Unscheduled.
- Site white-label claim (FAQ lines, ledger) once 13a1 is live on prod (Q8) -> Soon.

## Owner verification steps
1. `pnpm copy:review`: sign the Appendix E strings, plus the Task 9 extras: the approvals `items` tip sentence and 3 FAQ entries in the agency approvals/alerts guides. The Task 8 tips anchor to `how-to-use-it`.
2. On `cs_dev`: set a banned word in Settings > Runbook > Voice, run `brief-once`; the brief stays `ready` with the banned-word band and auto-send skips it.
3. Preview a voice (Preview button); the 11th preview of the day is refused.
4. Open an agency host: the tab icon is the neutral grey tile, not the radar. Open a client Checkout: it shows the agency name.
5. `pnpm demo:reset`, then check Brazos approvals shows the flagged brief and Lone Star shows "Own voice".

## Merge notes
- Root `CLAUDE.md`: favicon line "never white-label" becomes "platform host only" (Q4).
- BACKLOG closures: l.427 agency voice (4a); l.112 Connect product (9b M9); l.115 tab titles (9b R18, done in 15a); l.166 (fallbacks + support copy; agency-facing KB stays per Q9); the 13a2-tagged items in Phase 13a follow-ups (hosts, MCP/auth); the `kbNamesFor` part; the l.150 launch-gate strict-routes seed item.
- `pnpm kb:seed` after merge on each environment (new help pages). It reads `SERVICE_DATABASE_URL`; point it at the test DB explicitly in a worktree.
