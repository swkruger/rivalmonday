# 16-onboarding: owner verification (merged 2026-10-27)

Migration 0095; needs `STADIA_API_KEY`.

1. Incognito sign-up, the 4 agency steps, "Add your first client"; re-open step 1 via Edit, Settings fields intact.
2. Client with a listing: 7 screens, previews update live.
3. Client without a listing (real address): search runs, the client's own business is not suggested.
4. "Ask the owner to pick": staff see All set + "Waiting on ..."; the owner signs in, lands on Overview with the card, picks, starting point follows.
5. `/start/<slug>`: 3 steps in agency branding.
6. 390 px: no preview panel, readable column.
7. Sign [phase-16-onboarding-copy-signoff.md](phase-16-onboarding-copy-signoff.md).
8. Confirm the Stadia geocode price (assumed $0.001/request).
9. Add `STADIA_API_KEY` to the Vercel web env.
