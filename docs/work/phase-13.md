# phase-13 — Parity on overlap features (13a white-label, 13b local rankings)

**Kind:** planning   **Worktree:** none — on `main` (owner instruction)   **Base:** main @ 4b1fb82
**Spec:** 13b [2026-10-17-phase-13b-local-rankings-design](../superpowers/specs/2026-10-17-phase-13b-local-rankings-design.md); 13a none yet. Not in roadmap (add at merge).

## Status (overwrite)
13b spec written 2026-10-17 (owner review pending). 13a not designed.

## Next (overwrite)
Owner reviews 13b spec → 13b lean plan; brainstorm 13a (Q2–5, Q12).

## Interfaces this branch adds or changes
Migrations: next free at execution time (main 0064; phase-10 0065–0066; phase-11 next).

## Assumes from other branches
- **phase-10** (executing): `branding-editor.tsx` + wizard branding step; logo at `${APP_URL}/files/logo/…` (platform host — 13a must serve on agency host, B7); `brandingProblems(input, appUrl)`; `OutgoingEmail.stream`/`headers`.
- **phase-11** (planned): `OutgoingEmail.cc`; `/start` shows Rival Monday until an agency is assigned (11c L4).
- **phase-7-planning** (parked): Vercel, `rivalmonday.app`, sender `mail.rivalmonday.app`; per-agency senders deferred (= 13a).

## Decisions (owner-approved)
1. Two sub-phases, both in scope: **13a White-label parity**, **13b Local rankings upgrade**.
2. Geo-grid: **weekly scans for top-rival-tier competitors on the client's main keywords** + capped manual **"scan now"** with a cost guard (cf. $3 discovery cap). Scans are per client, so the tier picks which clients get them.
3. Map tiles from a commercial provider (MapTiler/Stadia-class); not Google or public OSM tiles.
4. Brief only; planned ahead of Phase 10.
5. 13b decisions 1–9: see 13b spec (weekly full scans, cap, MapTiler static, Trend+Compare, Map climb + tier_change).

## New backlog (target → item)
None yet.

## Owner verification steps
TBD.

## Brief

### 1. Scope
Match table stakes (feasibility §4.2) before outside agencies arrive via Phase 10.
- **13a** (feasibility §6.2 B5–B9, B11; core §2.2, §5.1, §8.3, §8.4, §9.2, §9.4): custom domains (app, sign-in, deep links, PDFs, MCP); per-agency sending domain (SPF/DKIM/DMARC, Postmark); scrub Rival Monday traces (connector name, Connect product name, `fromEmail` drop, tab title); agency voice for the brief writer; optional assistant rename, branded help (B4).
- **13b** (feasibility §6.3; core §4.2, §5.2 item 7, §6.1, §6.4): map tiles; weekly + manual scans; per-client keywords/grid/radius; rank trends + scan compare/scrub; rank movements → moves (rival into top-3 in N ZIPs), maybe `tier_change`; GeoGrid bug fixes.

### 2. Already built — reuse, don't rebuild
- Branding: `packages/ui/src/theme.ts`; `packages/tools/src/settings.ts` (`AgencyBranding` incl. fromEmail, signOff, assistantName); `apps/web/src/app/(app)/agency/branding/`; `packages/email/src/{branding,transport,layout}`.
- Names: `mcp/src/branding.ts` `productNameFor`; `web/src/server/ask.ts` `assistantNameFor`; `tools/src/kb/names.ts`; hard-coded `rival-monday` in `web/src/components/ai-connections.tsx:97`.
- Connect product: `billing/src/stripe-gateway.ts:163`.
- Links/PDFs: `engine/src/delivery/outbox.ts` (`APP_URL`); `/files/*`; `web/src/proxy.ts`.
- Writer: `engine/src/briefs/writer.ts`; `ai.yaml` `brief_writer`/`alert_writer`.
- Rankings: `collectors/src/rankings/scan.ts` (per client, all businesses per point; 7×7 × ≤5 kw ≈ $0.49); worker `rank-schedule` cron `0 6 1 * *` + `rank-scan` (`worker/src/jobs/vendor.ts`, not `competitor_source`); `rank_scan`/`rank_snapshot` (`db/src/schema/client-intel.ts`); `engine/src/structured/rank.ts`; `tools/src/tools/rankings.ts` (`get_geogrid`, `get_share_of_voice`); `web/src/components/charts/geo-grid.tsx`, `c/[clientId]/rankings/`.
- Moves: `engine/src/moves/rules.ts` (7 rules, no rank rule). Tiers: `db/src/schema/rivals.ts` (`Tier`), `competitor_signal`, `signals-weekly`.
- Cost guards: `rivals/run.ts` `planSearch`; `client.monthly_cap_usd`.

### 3. Binding decisions (never re-open)
- Root `CLAUDE.md`: nothing client-facing names Rival Monday; Vercel + one worker; Postmark; Better Auth (+ MCP OAuth) in `apps/web`; inline-SVG charts (dataviz); 404 refusals; writes via `runTool`.
- Discovery (12a D7): $3/run, grid 7×7→5×5 then drop keywords, 5 runs/agency/day; tiers Top/Worth watching/Minor (D2), weekly re-rate from stored data (D9).
- Core §6.1: `rank_change` is tenant-private, never cross-channel merged.
- 6a: MCP server name = productName. 7a: pg-boss crons only.

### 4. Backlog to fold in (verbatim)
- [ ] Agency custom domains; custom sending domains + DKIM per agency — *from 4b, 5a*
- [ ] Agency voice settings for the brief writer — *from 4a*
- [ ] Ad images (vendor media URLs expire and leak viewer requests); map tiles under the geo-grid; dark chart theme (with the app's dark theme) — *from 5c-1/5c-2*
- [ ] `GeoGrid`: legend emits duplicate `<defs id="geogrid-hatch-legend">` five times; fixed hatch id collides with two grids on a page; ragged rows not defended — *from 5c-2 Task 15*
- [ ] `get_geogrid`: a selected scan older than the newest 12 is missing from the scans list — *from 5c-2 Task 13*
- [ ] Connect product name uses `agency.name`, not `branding.displayName` (shows on Checkout/receipts) — *9b M9*
- [ ] Per-agency browser-tab titles on client pages (root title "Rival Monday" leaks; only `/c/[id]/settings/billing` fixed) — *9b R18*
- [ ] MCP hardening: … connector name `rival-monday` not white-labelled … — *from 6a* (that part only)
- [ ] Webhooks page …; branding save drops a stored `fromEmail` (latent) — *from 5a T18* (that part only)
- [ ] `tier_change` event when a tracked competitor's tier changes (deferred: `detected_change_subject_check` needs a capture or rank scan) — *from phase-12 plan 12a P4*
- [ ] Structured: …; `rank_scan.status` no CHECK; … — *from 3b Tasks 2, 5–7* (that part only)
- [ ] Knowledge base: … browsable Help page (`/agency/help`, `/c/<id>/help`) … — *from 6c "Not in 6c"* (optional)
- [ ] Legend: pinned "You" leads instead of following the name sort; … — *from 5c-2 re-review*
- *phase-11 backlog:* sign-in page uses host default branding (may show Rival Monday).

### 5. In-flight workstreams
- **phase-10** (executing): edits branding editor, `settings.ts`, email layout/transport; 0065–0066. High overlap with 13a.
- **phase-11** (plans only): email, sign-in, `/start`. Medium overlap with 13a.
- **phase-7-planning** (docs): `/bot` stays Rival Monday on any host. 13b overlaps none.

### 6. Open questions for the owner
1. **Order/split.** Answered: 13b first; 13a after phase-10/11 merge (13a1 domains+sender / 13a2 scrubbing+voice).
2. **Custom domains on Vercel.** (a) Vercel Domains API from the app; (b) manual by operator; (c) only `<agency>.rivalmonday.app`. *Rec: (a), with (c) as default host.*
3. **Verification/TLS.** (a) agency adds CNAME (+ TXT if asked), worker polls Vercel, live once verified + cert issued; (b) our TXT token first, then CNAME. *Rec: (a).*
4. **Host scope.** (a) app, sign-in, links, PDFs, logos, MCP + OAuth issuer all on the agency host; (b) all but MCP. *Rec: (a).*
5. **Sending domain.** (a) Postmark Domains API, records shown to agency, platform sender until verified; (b) manual; (c) shared sender, agency From-name only. *Rec: (a).*
6–11. Answered 2026-10-17 → 13b spec Decisions.
12. **Voice settings.** (a) preset formal/friendly/blunt + preferred/banned terms (core §5.1); (b) free-text prompt. *Rec: (a).*
