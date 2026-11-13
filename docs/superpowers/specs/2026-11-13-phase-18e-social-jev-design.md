# Phase 18e — Social (Facebook + Instagram) and Jev-only decisions

**Status:** draft for owner approval (2026-11-13). Owner accepted every brief recommendation ("yes continue") and added Track B. Calls marked *(my call)* are the controller's; overturn any.
**Core spec:** §1.5 public info only, §4.2–4.4 collection/evidence/vendor ledger, §6.1–6.3 changes/scoring/briefs (no evidence, no claim), §10.5 cost limits. **Probe:** `docs/research/2026-11-13-phase-18e-social-probe.md`.

## Intent
- **A — Social.** Rivals' public Facebook pages and Instagram accounts tell an owner who is marketing actively: follower growth, posting rhythm, offers. The 18a-1 page-like line only works for steady Meta advertisers; 18e covers everyone with a page. The client's own accounts are tracked too, so the brief can say "they post weekly, you haven't posted since June".
- **B — Jev only.** Jev's evals are trusted; stop paying for LLM escalation and shadow calls by default, with a staff switch back and a time-boxed "re-evaluate with all models" that measures Jev against the LLM on live traffic.

## Goals / non-goals / anti-goals
- Goals: confirmed FB/IG accounts per competitor (+ self); weekly followers + posts; brief lines (follower growth, offer posts, went quiet/started posting); scorecard row; one Ask/MCP/web tool; competitor-page block with confirm control. Jev-only mode + re-eval window + staff card.
- Non-goals: TikTok, LinkedIn, X, YouTube; reading video/images (captions only); prices from social posts; events from social posts (backlog); engagement metrics in the brief; alerts from social.
- Anti-goals: tracking the **wrong business** (same-name pages elsewhere were 4/18 in the probe) — an unconfirmed account never produces a client-facing line; naming the vendor anywhere client-facing; storing people's images; LLM spend creeping back without staff seeing it.

## A. Social — decisions
- **A1 Networks:** Facebook page + Instagram account, both via ScrapeCreators (18a: no new paid vendor; already used for Meta ads). Client text says "Facebook"/"Instagram", never the vendor.
- **A2 Discovery:** for each tracked competitor (rivals + self) with no social accounts, once, plus when the agency asks: `facebook/adLibrary/search/companies?query=<competitor name>` (1 credit). Candidate = first non-deleted result whose name starts with the competitor's first 10 normalised chars, preferring a `page_id` already in `competitor.meta_page_ids`. Then FB profile (1 credit). **Auto-confirm** when the FB `website` host, or the IG `external_url` host, equals the competitor's domain host after stripping `www.` (path ignored). Otherwise the account is stored as `suggested`. Linktree/scheduling hosts never confirm.
- **A3 Confirmation by people:** agency users confirm or reject a `suggested` account, or paste a page/handle URL, on the competitor page ("Social accounts" block). Confirmation is global per competitor (like competitor pins today), audited. Only `confirmed` accounts are collected weekly and shown/cited. Rejected candidates are not re-suggested.
- **A4 Weekly collection** (source kind `social`, weekly with the vendor jobs, `clientWorkAllowed`, vendor limiter, `vendor_call` ledger in credits): per confirmed FB account: profile (followers, likes, website) + posts pages until a post older than the last stored one or 3 pages; per IG account: profile (followers, post count, 12 recent posts with captions). Age-gated pages: `include_gated_profile=true`, followers only. One vendor_json capture per account per pull (capture `source 'social'`, `url 'social:facebook'|'social:instagram'`), evidence kind `vendor_json`. Expected ≈ 3–5 credits/competitor/week.
- **A5 Storage:** `social_account` (global_public) and `social_post` (global_public) — see Interfaces. Follower counts are `observation` rows (kind `social_profile`, value `{network, followers, likes?, posts?}`). Post text stored as published (public business posts); model input only via `redactForModel`.
- **A6 Changes** (engine `structured/social.ts`, inside the existing structured vendor diff):
  - follower growth → existing `audience_growth` with `details.network` (`facebook|instagram`); same thresholds/cooldown as 18a-1 `meta_page`, keyed per network.
  - new post with an offer → `promo` (`details.surface 'social'`, network, post url); offer = the 18b Google-post offer rules (`gbp-posts.ts` offer test) on the caption. Other new posts → no change row (cadence only; avoids noise).
  - cadence: `content` change "started posting" (≥ 3 posts in 14 d after ≥ 30 d silent) or "went quiet" (no post in 30 d after ≥ 4 posts in the prior 30 d), per network, two-pull confirm, 30-d cooldown.
  - all social changes **brief-only** (never alert), whole-business relevance; 21-day cut on post age (as 18b).
- **A7 Briefs/scorecard:** metric `socialPosts30d` ("Social posts (30 days)", email "Social") = FB + IG posts in the last 30 d per business, null when the business has no confirmed account. Self rule `social_gap`: self measured with 0 posts in 30 d and ≥ 2 rivals with ≥ 4 posts in 30 d → play `post_weekly` ("Post on Facebook and Instagram every week…" draft → copy review), weight 0.4.
- **A8 Pack flag:** `social: true` in all shipped packs (generic, hvac_plumbing, dental, venues_attractions), packs **v10** *(my call: the probe shows dental and HVAC rivals post actively; the flag lets an operator turn a vertical off)*. Discovery and collection skip verticals with the flag off.
- **A9 UI/tools:** no new page. Competitor page block "Social accounts" (per network: handle link, followers, last post date, status; Confirm / Not them / Add link). Client brief lines + scorecard row. Tool `get_social_activity` (web/mcp/ask): per business followers (latest + 90-d change), posts 30 d, last post, offer posts with evidence ids. Site compare row "social" flips to yes at merge (BACKLOG 17c item).
- **A10 Cost:** credits ledgered per call; social counts toward the client's credit budget and pauses with it (7b). Discovery spend for a new client ≤ 2 credits × competitors.

## B. Jev only — decisions
- **B1 Setting:** `platform_setting` key `ai_decision_mode`, zod `{ mode: 'jev_only' | 'cascade', reevalUntil: string | null }`. Migration inserts `{ mode: 'jev_only', reevalUntil: null }` *(owner: "continue with Jev only")*. Absent row / read failure ⇒ `cascade` (today's behaviour; keeps eval cassettes unchanged).
- **B2 Jev-only behaviour** in `Ai.decide` for Jev-primary tasks: no escalation, no shadow; keys below τ go to `needsReview` (existing human queues). **Exempt:** `ask_guard_decisions` stays cascaded (injection gate, quality gate 7c1) *(my call)*. If Jev errors or times out, the call falls back to the LLM as today and the ledger row carries `operation …:jev_down` *(my call: availability over purity)*.
- **B3 Re-evaluate with all models:** staff action sets `reevalUntil = now + 7 days`. While `now < reevalUntil`, every Jev-primary decision runs `decideShadow` (Jev + LLM in parallel), result by the cascade rule, sample stored (reason `reeval`), capped at **2,000 LLM shadow calls per UTC day** (then plain jev_only for the rest of the day). When the window ends the mode stays as set (normally `jev_only`).
- **B4 Staff card** on `/platform/costs` ("AI decisions", owner/operator only, like the spend-guard card): mode radio (Jev only / Jev with LLM backup), "Re-evaluate with all models for 7 days" button (or "Stop re-evaluation"), and the last window's result per task: samples, Jev–LLM agreement %, Jev-below-τ rate, LLM spend. Writes via a registered tool; reads via a registered tool.
- **B5 Cache:** the mode is read through a 30-s cached reader beside `createAiGuard`, wired in worker and web deps.
- **B6 Docs:** root CLAUDE.md decision line updated at merge ("Decisions run Jev-only by default; staff can switch back or run a 7-day all-models re-evaluation").

## Interfaces (binding)
- **Migration 0110 `social_jev`:**
  - `social_account(id uuid pk, competitor_id uuid fk, network text check in ('facebook','instagram'), handle text not null, external_id text null, url text not null, status text check in ('confirmed','suggested','rejected'), confirmed_by text check in ('website','agency') null, confirmed_by_user uuid null, gated boolean default false, created_at, updated_at, last_pulled_at timestamptz null)`, unique `(competitor_id, network, handle)`; partial unique `(competitor_id, network) where status='confirmed'`. Class `global_public`; RLS `app_competitor_visible(competitor_id)`.
  - `social_post(id uuid pk, competitor_id uuid fk, network text, post_id text, posted_at timestamptz, text text, url text, is_video boolean, reactions int null, comments int null, first_capture_id uuid fk capture, first_seen_at timestamptz)`, unique `(network, post_id)`; index `(competitor_id, posted_at desc)`. `global_public`, RLS as above.
  - Packs v10 backfill (`social: true`, rule `social_gap`, play `post_weekly`, type weight stays); `platform_setting` row `ai_decision_mode`.
- **Domain:** source kind `social` (in `DEFAULT_SOURCE_KINDS` only for packs with `social: true`; also in `SELF_SOURCES`); observation kind `social_profile`; `DecisionSampleReason` += `'reeval'`; `ScorecardMetric` += `socialPosts30d`; `SELF_RULE_IDS` += `social_gap`.
- **Collectors:** `packages/collectors/src/social/{search,facebook,instagram}.ts` — `findSocialAccounts(competitor) → SocialCandidate[]`, `pullFacebook(account, since) → { profile, posts }`, `pullInstagram(account) → { profile, posts }`; all through the existing ScrapeCreators client (`vendors/scrapecreators.ts`) and limiter.
- **Engine:** `structured/social.ts` `diffSocial(prev, cur, history) → ChangeDraft[]`; cadence helper `socialCadence(posts, now)`.
- **Tools:** `get_social_activity { clientId } → SocialActivityView` (web/mcp/ask); `list_social_accounts { competitorId }` (web, agency roles; includes suggested/rejected); `confirm_social_account { competitorId, accountId | url, decision: 'confirm'|'reject' }` (web, write); `find_social_accounts { competitorId }` (web, write; queues discovery, 1/competitor/7 d); `get_ai_decision_mode {}` / `set_ai_decision_mode { mode?, reeval?: 'start'|'stop' }` (web, platform staff only).
- **AI:** `createAi` deps += `decisionMode?: () => Promise<AiDecisionMode>`; `AiDecisionMode = { mode, reevalUntil }`; `REEVAL_DAILY_CALL_CAP = 2000`.
- **Worker:** jobs `social-discover` (on competitor add / button) and `social-pull` (weekly vendor jobs); engine stage `structured` handles `social` captures.

## Review focus (failure modes most likely to bite)
1. Wrong business: unconfirmed or rejected accounts must never reach a brief, scorecard, tool output or Ask answer.
2. A page that changes its website after confirmation stays confirmed (no silent re-check) — documented; agency can reject.
3. FB post pagination must stop at the last stored post (credits) and survive a deleted/edited post.
4. Jev-only must not break request-path tasks (verifier, ask_interpretation): a Jev timeout falls back, never fails the request.
5. Re-eval cap and window end must hold across worker restarts (state in DB, counter by ledger rows).

## Left to the builder
Exact copy (draft → `pnpm copy:review`), card layout within the design system, job batching, fixture shapes from the probe output.
