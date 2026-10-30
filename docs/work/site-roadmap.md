# site-roadmap

**Goal:** public `/roadmap` page on rivalmonday.com (agencies only; clients never see the platform name) showing the version 2.0 "act on a recommendation" plan with the action-loop diagram, while Google Business Profile API access is pending. Source: [research/2026-10-29-act-on-recommendations-proposal.md](../research/2026-10-29-act-on-recommendations-proposal.md).

**State (2026-10-29):** built. `content/roadmap.ts` (copy), `src/components/roadmap/action-loop.tsx` (inline SVG from md up + numbered list), `src/app/roadmap/{page,opengraph-image}.tsx`, registry entry in `content/pages.ts` (sitemap, top nav after Partners; header fits at 1024 px), footer Product link, `/roadmap` in e2e `NEW_PAGES`. Focused site tests (95), tsc, site lint, design-lint pass. Checked at 1280 and 390 px (no overflow).

**Owner:** copy approved in chat 2026-10-29 (still to be signed in `pnpm copy:review`, surface `site`); top nav: yes; merge: go-ahead given. Not run: site e2e, full suites (`/rm-merge`).
