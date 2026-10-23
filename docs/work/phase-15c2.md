# phase-15c2 — page fixes + small features (15c spec §4)

**Kind:** build   **Worktree:** ../CompetitorSpy-wt/phase-15c2   **Base:** main @ a342b687
**Plan/spec:** [15c-2 spec](../superpowers/specs/2026-10-23-phase-15c2-page-fixes-design.md) (D1-D8); [15c spec](../superpowers/specs/2026-10-21-phase-15c-page-fixes-design.md) §2 (C1-C11), §4; 2a plan: `docs/superpowers/plans/2026-10-23-phase-15c2a-page-fixes.md`.

## Status (overwrite)
15c-2a built (T0–T17), final whole-branch review next; 15c-2b not started. Copy sign-off: `docs/archive/phase-15c2-copy-signoff.md` § 15c-2a (12 owner decisions at its top).

## Next (overwrite)
Final 2a whole-branch review + fix wave (ledger items marked FIX IN FINAL) → owner verification (below) → 15c-2b plan + mockups (sheet, page diff). Pre-flight for 2b: rebase on main, re-check 7b1 migration numbers (0085–0087 there; ours 0087/0088 after renumber) and 13a.

## Interfaces this branch adds or changes
2a (built): tools `delete_webhook`, `test_webhook`, `resend_invitation`; `list_platform_agencies.query`/`prevCursor`; paging on `list_pool_leads`/`list_decision_reviews` (`prevCursor`, `total`); `list_alert_queue.clientId`/`capped`/`clients`; `get_brief_review.clientTimezone`. `resendInvitation(ctx, deps, invitationId, now?)` in `access/team.ts` (callers must use the tool: the limit counts audit rows; 15c-3 reuses it). `team_invite` sends the email directly; `rm_pending_email` signed cookie; table `email_resend` (migrations **0087** table, **0088** RLS; renumbered after 15b-3b/7b1). Engine `postWebhook` (only webhook POST path), env `WEBHOOK_FAKE_SEND` (E2E only). UI: `readableTextOn`/`contrastRatio` (`@cs/ui` theme.ts), `--primary-foreground` runtime var (themeVars). Web: `components/confirm-form.tsx`, `lib/page-gates.ts` (`GATED_PATHS = [...AREAS_2A]`), `billing/tabs.ts`, route `/agency/settings/intake/preview`, `IntakeLanding.preview`.
2b (not built): `ListDetail`, `compare_captures`, Ask delete (spec §3; Ask delete decision per spec D8).

## Assumes from other branches
- **phase-15b3b** (unstarted): renames `/platform/themes`→`/platform/topics`, `theme-queue.tsx`, `components/charts/theme-heatmap.tsx`, `?theme=` on `c/[clientId]/reviews/page.tsx`, help key `page:platform.themes`, `get_theme_benchmark`, `search_reviews.themeId`. Our tasks on these files go last (C7); second to merge rebases.
- **phase-15c3** (unstarted): reuses our `resendInvitation` service fn in `packages/tools/src/access/team.ts` (spec §5.2) and our ConfirmDialog adoption on `/platform/agencies/<id>`; the agency "coming soon" line is 15c-3's. We don't touch `billingAccess`/`agencyServiceable`.
- **13a** (unbuilt): `client-profile-form.tsx`, `/start*` (focus/privacy/CTA fixes), `start/landing.tsx` `IntakeLanding` (intake preview), error pages. Second to merge rebases.
- **phase-7-planning** (docs only, 1 file): no code overlap. Its 7b UI (cap notices, usage page) builds on our chips/labels; 7b2 touches billing pages after 15c-3.

## Decisions (owner-approved)
Spec D1-D8 (2026-10-23): two plans by area (2a platform/agency/account, 2b client); parallel with 15b-3b, theme tasks last; Ask soft delete; sweep every page + grep gates; fold Polish on touched pages; no TzCookie reload; `team_invite` email for agency invites; deleted Ask threads keep the 6b `askReviewAllowed` rule.
Execution rulings (2a): **R-DS1** `readableTextOn` = higher contrast of white vs ink, so #47A8E7 gets an ink label (DS v1). **R-DS2** billing tabs keep the segmented `TabsLink` until the DS phase restyles primitives. **R-DS3** `StatusChip` stays the status primitive (no StatusBadge yet). **R-DS4** `--color-primary-foreground: var(--primary-foreground)` via `@theme inline`, `:root` default ink, themeVars overrides per agency. **T11 dedupe:** resend outbox key is per-call unique (`client-invite:${id}:resend:${uuid}`) and `sendClientInvite` reports false when nothing was inserted, so a resend is never swallowed. B10 Usage dialog stays with 7b1.

## New backlog (target → item)
- Agency privacy URL and agency site URL in branding (agency /start/v CTA link, intake privacy link) → 13a/15c-3.
- `email_resend` retention: purge rows older than 1 h → ops/7b.
- Webhook host allow-list includes `.logic.azure.com` / `.environment.api.powerplatform.com` (any Azure tenant can get one; a tester can make us POST to their endpoint; not internal SSRF; same policy as the real sender) → note/decide in 7b.
- `--color-secondary-foreground` still a literal → DS phase.
- E2E production build (~10 min here) exceeds Playwright's 300 s webServer timeout: build first, then `E2E_SKIP_BUILD`.
- Team invite From address is the lead-mail from-address (rivalmonday envelope for white-label) → 13a neutral domain.
- Deferred minors from task reviews are listed in `.superpowers/sdd/.../progress.md` (not committed); the final review fixes the FIX IN FINAL ones.
- E2E stream message (T15): infra/noise, no action (finding below).

## Owner verification steps
1. Webhooks (`/agency/settings/slack-teams`): add a real Slack URL, press Send test, see the message in the channel; Delete shows the confirm.
2. Team: invite a person, find the email in `apps/web/.outbox`; Resend (4th in 24 h refused).
3. Intake: `/agency/settings/intake` → Preview your page, with the link turned off (frame bar says so; buttons disabled).
4. Sign-in and sign-up check-email: Resend email, 60 s countdown, same result line every time.
5. `/platform/billing`: five tabs, each confirm; `/platform/agencies` search + paging; leads/reviews paging.
6. Alert review: client filter, cap notice, "Waiting …" age, Dismiss dialog.
7. Branding: light and dark agency colours give readable buttons (contrast line) in the app and in copied intake HTML.
8. Tick or edit the 12 owner decisions in the sign-off doc.
9. Reset `cs_dev` first if it applied the old 0085/0086 `email_resend` migrations, before running 0087/0088.

## Brief (distilled)
Scope: spec D1-D8 and 15c spec §2 (C1-C11), §4. 2a = platform + agency + account/public pages and features (agencies search, leads/reviews paging, billing tabs, alert filter, webhooks, invite + sign-up resend, intake preview). 2b = client pages (`ListDetail` sheet below `lg`, `compare_captures` whole-page diff + evidence section, Ask delete). Inputs: UX audit `docs/research/2026-10-18-phase-15-ux-audit.md`; 15c-1 backlog items are folded into the plan (`docs/superpowers/plans/2026-10-23-phase-15c2a-page-fixes.md`). Assumes: 15b-3b merged (theme→topic renames done), 15c-3 reuses `resendInvitation`, 13a rebases `/start*` and `IntakeLanding`.
