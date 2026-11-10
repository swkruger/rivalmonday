# phase-18b — Wider sources: more Google via DataForSEO

**Kind:** implementation   **Worktree:** ../CompetitorSpy-wt/phase-18b   **Base:** main @ 843cfbac
**Plan/spec:** [spec 18b-1](../superpowers/specs/2026-11-10-phase-18b1-gbp-posts-design.md) · [plan 18b-1](../superpowers/plans/2026-11-10-phase-18b1-gbp-posts.md) · [spec 18b-2](../superpowers/specs/2026-11-10-phase-18b2-search-visibility-design.md) · [plan 18b-2](../superpowers/plans/2026-11-10-phase-18b2-search-visibility.md) (no roadmap row; add "18b. Wider sources: more Google" at merge)

## Status (overwrite)
**18b-1 and 18b-2 code complete** (2026-11-10): 18b-1 Tasks 0–8 + final review + one fix wave (clean, 588c4009); 18b-2 Task 0 probe + Tasks 1–4 (Task 5 dropped by the probe) + final review + one fix wave (clean, e310b379). Whole-branch `e2e:affected` 154/154 and profile-gate exit 0 (every page ≤ 8 stages) at f6ba95b2; `test:affected` then had 5 Task-4 failures, all fixed in the 18b-2 fix wave (focused runs green) — **no full `test:affected` after the last fix wave**. Vendor spend this session: $0.003 (posts probe) + $0.018 (search probe).

## Next (overwrite)
1. Owner: review, then go-ahead for `/rm-merge phase-18b` (merge runs the full unit + E2E suites after asking; CI runs both).
2. Before merge: re-check `POST_PRICE_SINCE` (`packages/engine/src/prices/post-price-stage.ts`, 2026-11-17) against the real deploy date.
3. After merge: owner steps below.

## Interfaces this branch adds or changes
- Migrations **0105** `gbp_posts` (table `gbp_post`, `price_point.gbp_post_id`, subject check = exactly one of page/ad/post, `gbp_posts` source backfill due +2 h) and **0106** `serp_snapshot` (tenant_client). Next free: **0107**.
- Source kind `gbp_posts` (in `SOURCE_KINDS` and `SELF_SOURCES`); vendor_task kind `google_posts`; post captures = `source google_business_profile`, `url 'gbp:posts'` (`GBP_POSTS_URL`); evidence source `google_search`.
- Engine: `diffGbpPosts`, `postCounts30d`, stage `post_price_extract` (`extractPostPrices`, worker job `engine-post-price`, `EngineWork.postPrices`), `diffSerp` inside `rank_diff`, `SHARED_HOSTS`/`isSharedHost`, `changeCaptureId` (page-one evidence via scan + keyword). `rank_change` gains `details.surface 'organic'`; `profile_change` gains fields booking/attribute/photos.
- `PriceNow.source` + `'gbp_post'` (shown, not counted), `PriceNowView.postUrl`; scorecard row metric `googlePosts30d` ("Google posts (30 days)"; `values` exhaustive object, old scorecards default null).
- Tool `get_search_visibility` (tenant-private, ISOLATION_FIXTURES); Rankings "Google search" section; `SOURCE_LABELS` gbp_posts/google_search.

## Assumes from other branches
None.

## Decisions (owner-approved)
1. 2026-11-10: brief recommendations accepted (18b-1 = posts/offers + GBP leftovers; 18b-2 = organic + AI answers + LSA; Q&A, News, Tripadvisor/Trustpilot out).
2. Self posts collected; brief scorecard shows "Google posts (30 days)" you vs rivals (owner addition).
3. 18b-2 plan approved incl. ≤ $0.05 probe; probe found AI answers 0/9 and Local Services 0/9 on local queries → AI-answer events and "Cited in AI answers" column dropped (spec rule < 30 %); LSA stored, shown only when present.
4. Controller rulings (offer scoring as whole business, photo-push cooldown, "checked every week" copy, empty search = failed, etc.) are listed in the session's final message and in the spec docs.

## New backlog (target → item)
- Unscheduled → re-probe Google AI answers on local queries quarterly (18b-2 probe 2026-11-10: 0/9).
- Unscheduled → store the client's own website and match it in `get_search_visibility` (own listing unhighlighted when the self competitor has no domain).
- Polish → `get_search_visibility` and `get_geogrid` return `vendor_json` evidence ids to MCP that `get_evidence`/`fetch` won't serve; filter by `citableEvidenceKinds(meta)` (as `get_ad_activity`).
- Polish → `adPrices` sweep + `extractAdPrices` ignore `clientWorkAllowed` (competitor tracked only by paused/archived clients still priced).
- Polish → post prices carry no evidence ids (Ask drops them as uncited; same as `meta_ad`).
- Polish → novelty over shared summary prefixes ("Posted on Google:") may over-discount a rival's second offer; score novelty on `afterText`.
- Polish → an edited Google post under the same id keeps its old open price; price card links only the first post url per cell.
- Polish → page-one series restarts on a grid-size-only change (search area unchanged).
- Polish → summaries in `engine/src/tag/structured.ts` are outside the `copy:review` scan.
- Waiting → verify the `local_services` parse on the first live Local Services block (fixture is hand-made).
- Waiting → an image-only Google post (no text, no url) parses to null and suppresses ending for that capture (fails safe).
- Polish (nits) → T1 schema comment placement; `sources.ts` vendor_task kind comment; `ensureSelfCompetitors` gbp_posts test; photo-push steady-growth test; stale `glossary.ts:233` comment.

## Owner verification steps
1. `pnpm copy:review`: sign 18b copy — "From a Google post", post-link label, Pricing guide line, MCP describe texts (`PriceNowView`, `get_search_visibility`), post/booking/attribute/photo summaries, "Google posts (30 days)" + email "Posts" key line, "Google search" section + sub-line ("checked every week"), page-one summaries, Rankings guides, neutral "ranking change(s)" label, updated email preview (re-sign `document.brief_report`).
2. Any env with data: `pnpm db:migrate` (0105, 0106) → deploy worker → web; then `kb:seed` (Pricing + Rankings guides changed).
3. Staging, first week: `vendor_task` kind `google_posts` rows complete; `gbp_post` rows appear for rivals and the client; spend ≈ $0.003 per business per week. After 2 weeks: a rival offer post appears as a brief line; a price tagged "From a Google post" on Pricing; scorecard "Google posts (30 days)" filled.
4. Staging Sunday scans: `serp_snapshot` rows per keyword; Rankings "Google search" section filled; first page-one brief line only after the 3rd scan with unchanged settings.
5. GBP leftovers: booking-link/attribute changes need two pulls; photo bursts show ~3 weeks after they happen, once.

## Brief
Kickoff brief (2026-11-10) is in git history (`git show ca0af12d:docs/work/phase-18b.md`); specs supersede it.
