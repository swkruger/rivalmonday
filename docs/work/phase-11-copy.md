# phase-11 — copy for owner sign-off

Strings quoted from the source (2026-10-17). `{x}` = a runtime value. Approve or edit; the file named in each heading is where to change it.

## 11a — setup wizard
`apps/worker/src/jobs/setup.ts` `linesFor` (agency notice bodies, two lines each):
- Suggestions ready: "We found competitors that look like a fit for {client}." / "Pick the ones to track so their first brief can start."
- Owner changed setup: "{client}'s owner made changes to their setup." / "Take a look and finish what is left."
- Idle (3 or 7 days): "{client}'s setup has been waiting on you for {n} days." / "A few quick choices are left before their first brief can start."

`packages/tools/src/tools/setup.ts` (`find_business`):
- Not configured: "Business search is not configured"
- Vendor outage: "Business search isn't available right now. Try again, or enter the details by hand."

`apps/web/src/app/(app)/c/[clientId]/setup/refusal-copy.ts` (failed competitor search):
- internal_error: "The search ran into a problem on our side. Try again, or skip this step."
- stale: "The search took too long and was stopped. Try again, or skip this step."
- cost_cap: "The search stopped early. Try again, or skip this step."
- any other code: "The last search didn't finish. Try again, or skip this step."

Place-id help line (`steps/business-step.tsx`, label "Google place id"): "Lets us benchmark the business’s own reviews against its competitors."

## 11b — invite, review email, billing step
`packages/email/src/templates/client-invite.tsx` (footer "Invitation from {agency}"):
- Subject: "{agency} invited you to see your competitors"
- Body: "{agency} is setting up weekly competitor reports for {business}. Sign in to see who you're up against and what they're changing."
- Button: "Get started"

`competitor-review.tsx` (footer "Sent by {agency}"):
- Subject: "Review the competitors we found for {business}"
- Body: "We found these businesses competing with you:" (up to 5 names) then "Tick the ones you want us to watch and untick any that aren't real competitors."
- Button: "Review competitors"

Wizard strings (`setup-wizard.tsx`, `steps/invite-step.tsx`, `steps/billing-step.tsx`, `setup/actions.ts`):
- "Invite sent." / "Review email sent." / "Nothing new to send right now."
- Labels "Owner's name", "Owner's email"; buttons "Send invite", "Send again"
- "An agency admin turns on billing."
- "Enter the monthly price in dollars, e.g. 299." / "Enter the setup fee in dollars, e.g. 0 or 99.50."
- Billing refusals (`packages/tools/src/tools/client-billing.ts`): "Connect Stripe first." / "Finish your Stripe setup first." / "Invite the business owner first." / "Set a default price first, or give this client a price." / "Stripe couldn't complete that. Please try again."

## 11c — intake and leads
Lead emails (`packages/email/src/templates/lead-*.tsx`):
- Verify (footer "Sent by {brand}"): subject "Confirm your email to see your competitor snapshot"; body "Click below to confirm your email and see how {business} compares with nearby businesses."; button "See my snapshot"
- Confirmation (footer "Sent by {brand}"): subject "Your competitor snapshot for {business}"; the snapshot facts and summary inline; closing "{agency} will be in touch within one business day." or, platform lead, "We'll match you with a local marketing partner and they'll be in touch."; failed preview: "We couldn't build your snapshot, but {agency} has your details." (platform: "…but we have your details.")
- Declined (footer "Sent by {agency}"): subject "About your request, {business}"; body "Thanks for your interest. {agency} isn't able to take on new clients in your area right now."
- New lead (agency notice and platform pool notice; footer "Notice from {brand}"): subject "New lead: {business}"; panel "Business: …", "Contact: {name} ({email}, {phone})", "Ref: …"; button "Review the lead" (pool: "Open the lead pool")

Public pages (`apps/web/src/app/start/`):
- Heading "Get your free competitor snapshot"; intro "See how your business compares with nearby competitors on Google."; platform page only: "We'll match you with a local marketing partner."
- Form: "Business name", "City and state, or ZIP", "Find my business", "Searching…", "Your name", "Email", "Phone (optional)", "What would you like help with? (optional)", "I agree to be contacted about my request.", "Get my free snapshot"; done: "Check your email — we sent a link to confirm it."
- Lookup errors: "No businesses found. Check the spelling or try a ZIP code." / "This page is no longer available." / "Business search isn't available right now. Try again later." / "Too many searches. Please try again in an hour." / daily cap "This page has had a lot of requests today. Please try again tomorrow."
- Submit errors: "Choose your business first." / "Enter your name." / "Enter a valid email address." / "Please agree to be contacted about your request." / "Please complete the check and try again."
- Preview page: "Your competitor snapshot for {business}", "Building your snapshot…", "Your snapshot is taking longer than usual — we'll email it to you.", "Nearby competitors", "No rating yet", failed: "We couldn't build your snapshot, but {agency} has your details."; closing line as in the confirmation email
- Expired link: "This link has expired." / "Start again." / "Start again from the page where you asked for your snapshot."
- Tab titles: "Get your free competitor snapshot · {agency}" or "· Rival Monday" (platform page), "Your competitor snapshot · {brand}", "Link expired · {brand}"

Agency pages (`/agency/leads`, `/agency/settings/intake`):
- Leads intro: "Businesses that asked for a competitor snapshot. Accept one to set it up as a prospect and invite the contact."
- Empty states: "No new leads. Share your intake link to start getting them." / "No accepted leads yet." / "No declined leads."
- Source badges: "From your website" / "From the platform"; "Snapshot is being built…"; buttons "Accept", "Decline", "Accept and invite {contact}", "Let them know"; platform lead decline note "This lead goes back to the pool."; "Open setup"
- Intake card: "Intake link"; intro "A public page where businesses ask for a free competitor snapshot. New requests appear under Leads."; card text "Share this link, or add the button to your website. Visitors search for their business and get a free competitor snapshot; you decide who to accept."; "Accepting new leads" / "Switched off — visitors see that the page is unavailable"; "No link yet. Choose a name below, or leave it empty and we will use your agency name."; button snippet text "Get your free competitor snapshot"

Platform page (`/platform/leads`):
- Intro "Verified requests from the platform page that no agency holds yet. Assign one to an agency; it is notified by email."
- "Pool ({n})", "The pool is empty.", badge "Declined by an agency", "Recent assignments", "Nothing assigned yet."
