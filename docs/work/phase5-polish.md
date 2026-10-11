# phase5-polish — small fixes from the end-of-Phase-5 owner verification

**Kind:** polish   **Worktree:** main checkout (started before the worktree convention)   **Base:** main @ 8a62e28
**Plan/spec:** none (bounded changes, each approved in chat 2026-10-11)

## Status (overwrite)
Done and committed, not merged:
1. PDF and captured-file links open in a new browser tab (`20b1784`).
2. Stored brief and report PDFs are re-rendered after a layout change (`144e577`).

Waiting on owner detail: the client grid and phone layout item.

## Next (overwrite)
Owner: say which screen the "client grid" is and what looks wrong, ideally with a screenshot in `docs/examples/`. Agent: fix it, then merge with the owner's go-ahead.

## Interfaces this branch adds or changes
- `@cs/core` exports `PDF_LAYOUT_VERSION` (now 2), `PDF_KEY_SUFFIX` (`.v2.pdf`) and `isCurrentPdfKey(key)` (`packages/core/src/pdf-layout.ts`).
- Stored PDF keys are now `briefs/<agency>/<id>.v2.pdf` and `reports/<agency>/<id>.v2.pdf` (`briefPdfKey`, `reportPdfKey`). `servePdf` serves only a key of the current version; any other key enqueues a re-render. Old `<id>.pdf` objects stay in the store, unreferenced.
- **Raise `PDF_LAYOUT_VERSION` after any change to how a brief or report PDF looks** (templates under `packages/email/src/templates/`). Old PDFs then re-render one by one as they are opened.
- Demo placeholder PDFs use the current key; the demo coverage test fails on an old one.

## Decisions (owner-approved)
1. PDFs open in a new tab (`target="_blank" rel="noopener noreferrer"`).
2. Re-render by layout version in the file name, with no migration.
3. No "view as client" switch for DEV. Panel sign-in stays blocked on DEV, because it would sign in as real accounts without an email. On DEMO the panel already offers client-owner sign-in links. **On DEV, invite a Gmail plus address**, for example `<you>+owner@gmail.com`, as a client owner (Agency → Team → Invite). It reaches the normal inbox but is a separate user.

## New backlog (target → item)
- Polish → fix the client grid layout, and the theme and layout on a phone (waiting on the owner's detail).
- Polish → let agencies add their own verticals and services (feature-sized).
- Polish → franchise brands: choose the local franchisee's ad accounts, not the brand's.

## Owner verification steps
- Open any sent brief's "Download PDF": it opens in a new tab. A brief rendered before this branch shows "Preparing your PDF…" once (worker running), then the re-rendered PDF.
