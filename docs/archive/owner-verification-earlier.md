# Owner verification — earlier phases (moved out of STATE.md 2026-10-29)

Still pending unless the owner says otherwise.

**Owner - Phase 7b2 verification** (no migrations; M8 copy signed off): on a Vercel preview set `BILLING_FAKE_GATEWAY=1` and confirm the deploy refuses to serve. Add to the first-deploy checks.

**Owner - Phase 15c-3b verification** (no migrations): publish a version with MCP unticked; move two test agencies (one with a Stripe test subscription: new prices from next billing date, no proration item; held/cancelled greyed); admins get the email; agency page shows "Plan v2"; sign [archive/phase-15c3b-copy-signoff.md](phase-15c3b-copy-signoff.md).

**Owner - Phase 15c-3a verification:** (1) put a test agency on hold: its admin gets the email, the agency UI is read-only with the banner, Stripe test subscriptions show "collection paused"; (2) lift it: the email arrives and collection resumes; (3) archive an agency with a live test subscription: refused; (4) cancel it, archive, find it under Archived, unarchive; (5) invite an agency admin: the email names the agency, not you; (6) change roles and hit the last-admin refusal; (7) sign [archive/phase-15c3a-copy-signoff.md](phase-15c3a-copy-signoff.md) incl. its 3 questions.

**Owner - Phase 15c-2b-2 verification** (no migrations): zone labels ("CT") on Changes/alert/evidence pages; Changes at 390 px list-only; Alert rules band bar and Save-on-change; Delivery Discard; confirm dialogs (billing link, Stop tracking); Ask privacy sentence; Usage "Ask turned off by limit"; Reviews "Show as table".

**Owner - Phase 7c1 verification** (no migrations): (1) GitHub environment `evals` with secrets `OPENROUTER_API_KEY`, `POSTMARK_SERVER_TOKEN`, `EVALS_ALERT_TO`, `EVALS_ALERT_FROM`; run `workflow_dispatch` once; **do NOT make `evals-live` a required check** (`ask-inject-09` flaps; BACKLOG § Owner). (2) Labels: regenerate CSVs with `pnpm --filter @cs/evals eval label --suite <s> --export label-work/<s>-labels.csv`, fix in `tools/decision-labeler.html`, `eval label --import ... --by <name>`, `eval run --suite <s> --mode replay --update-baseline`; commit. (3) Sign off: Ask drops uncited figure/date sentences. (4) Agency alerts `?client=<foreign id>` 404. (5) Confirm R7 (global catalogue) is by design.

**Owner - Phase 15c-2b-1 verification** (0089-0092): delete an Ask thread via the dialog (`/platform/ask` shows "Deleted by user"); Changes "Whole page" tab on a web price change; evidence "Compare with previous"; 390 px Changes/Moves open a right sheet on tap; double-save of an Ask answer gives one row; decide the P6 message-keyed dedupe (BACKLOG § Phase 15).

**Owner - Phase 7b1 verification** (deploy web + worker together): (1) agency usage page shows credits only, read-only; a client owner sees their own usage; (2) set a low client limit override: reached shows the calm notice; 130 % pauses once with banner and emails; raising it shows "Pause lifted."; (3) Ask on a paused client says so; a rank scan is refused; (4) lower spike floors on `/platform/costs`: Health shows Warning/Paused, Reset needs a note.
