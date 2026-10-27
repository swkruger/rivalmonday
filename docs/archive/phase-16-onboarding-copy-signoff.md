# 16-onboarding copy sign-off

Owner: read each screen's strings, tick or edit, then answer "Decisions for the owner" at the end. Source of truth is the code under `apps/web/src/app/(onboarding)/`, `apps/web/src/components/onboarding/`, `apps/web/src/app/start/`, `apps/web/src/app/sign-up/`, `apps/web/src/components/client/owner-welcome.tsx` and `apps/web/src/lib/labels.ts`. `{x}` marks a name or number filled in at run time. Copy follows the repo rules: plain and short, "they" or a name (never gendered words), client-facing text says the agency's name and never Rival Monday.

## 1. Sign-up and join (Rival Monday branded)

- Title "Start your free 30-day trial". Subtitle "No card needed. Watch your clients' competitors from public information, with a brief every Monday."
- Top right "Have an account? Sign in".
- Labels "Work email", "Agency name". The old "Your name" field is gone. Privacy sentence unchanged.
- Right panel proof points: "Weekly briefs with evidence", "Your brand not ours", "Map rankings every week". Image alt text per `docs/design-system/images.md`.
- Join (invite link) titles, paused and invalid-link states unchanged.

## 2. Agency wizard (platform branded)

### Step 1: About your agency
- Title "Welcome to Rival Monday". Subtitle "The basics your clients will see. The rest can wait for Settings." Step label "About your agency".
- Labels "Agency name", "Contact full name", "Phone", "Email address", "Street address", "Suite or unit", "City", "State", "ZIP code". Link "+ Add an address". Group "Address (optional)".
- Checkbox "Use this for billing too". When off: "Add a separate billing address later in Settings, under Agency profile."
- Buttons "Continue", "Save and exit".
- Preview caption "Live preview. How you appear at the bottom of every client brief." Sample text "Three things your rivals did this week", "(555) 555-0100 · you@agency.com", "Your address, if you add one", "Your name", "Your agency".

### Step 2: Your team
- Step label "Your team". Title "Invite your team". Subtitle "Teammates get an email from {agency}. You can add people later too."
- "Invite people (optional)", "Email {n}", "Role {n}", placeholder "name@agency.com", "+ Add another", "Remove invite {n}". Hint "Admins manage billing and team. Account managers run clients."
- Buttons "Send {n} invite(s)" or "Continue", "Skip for now", "Back".
- Preview caption "Preview. The invite email your team receives." Email preview: "From:", "To:", "{inviter} invited you to {agency}", "You'll help run competitor tracking for our clients as {an account manager | an agency admin}.", "Accept invite".

### Step 3: Make it yours
- Step label "Make it yours". Title "Put your brand on it". Subtitle "Your clients see your logo, colours and name, not ours."
- "Agency logo (optional)", hint "PNG, JPEG, WebP or SVG, up to 512 KB. It is resized to fit." "Brand colour (optional)", hint "We keep text readable on any colour." Swatch labels "Use #hex". "Name your clients see (optional)". "Uploading…". Upload errors reused from the Settings editor.
- Preview caption "Live preview. Your client's dashboard with your logo and colours." Sample text "Your client's dashboard", "Overview", "Your rating 4.7", "Rival moves 6", "Map rank #3", "Open this week's brief".

### Step 4: You're all set
- Step label "You're all set". Title "You're all set, {first name}" (or "You're all set"). Subtitle "Check your details, then add your first client."
- Summary rows "Agency", "Contact", "Team", "Brand" with "Edit". Values "{n} invite(s) sent" or "No invites yet"; "Logo and colour set", "Logo set", "Colour set" or "Default look".
- "What happens next": "Add your first client: About 5 minutes: find the business, confirm its services, pick competitors." "We start watching: Their starting-point brief is ready within 48 hours." "A brief every Monday: You approve it before your client sees it."
- Buttons "Add your first client", "Go to dashboard". Timeline caption "Your first two weeks, from first client to first Monday brief." Timeline text "Cool Breeze Heating & Air", "Today · client added", "Starting point", "Within 48 hours", "Monday brief", "Every week, approved by you".

### Getting started checklist (Portfolio)
- "Getting started", "{n} left to do", "Finish your agency details", "Add your first client", "Add a payment method", "Invite your team", "Add your logo and colours", "skipped", "Dismiss".

## 3. Add a client or prospect (agency, steps 1 to 7)

### Step 1: Client details (prospects: same screen)
- Title "Add a client" or "Add a prospect". Subtitle "Who you're setting this up for. Only the starred fields are needed now."
- Labels "Business name", "Contact full name", "Phone", "Email", group "Address (optional)" with "Street address", "City", "State", "ZIP code", "Logo". Hints "We'll suggest them as the owner to invite." "PNG, JPG or SVG, square, up to 512 KB." Button "Remove".
- Errors "Enter the business name.", "Enter the contact's full name.", "Enter a phone number.", "Enter a US phone number, like (404) 555-0100", "Enter an email address.", "Enter a valid email address", "Add the street address, or clear the address.", "Add the city.", "Add the state.", "Enter a 5-digit ZIP code", "Logo must be 512 KB or smaller."
- Buttons "Exit", "Continue". Preview caption "Live preview. The top of every brief {client} receives." Preview "Weekly brief · every Monday", "Prepared for {contact} by {agency}".

### Step 2: Find the business on Google
- Title "Find the business on Google". Subtitle "We use the listing for their rating, reviews and location."
- Labels "Business name", "City or ZIP", "Business type", "Choose a business type". Buttons "Search" (was "Find business"), "Search again", "Searching...", "Back".
- Messages "No businesses found. Check the spelling or try a ZIP code.", "Chosen from the Google category "{category}".", "Choose a business type.", "Enter a City or ZIP so we can place the business on the map." Link "Can't find it? Continue without a listing".
- Preview caption "Live preview. The listing you picked. Blank details from step 1 are filled from it." Empty "Pick a listing to see it here."

### Step 3: What they do and where
- Title "What they do and where". Subtitle "We search these words around the business to find its rivals."
- "Search keywords", "Add a keyword", "{n} of 5. Suggested from their Google listing." "Search radius" with "5 mi", "10 mi", "15 mi", "25 mi". "Around {address}." or "Around the business location." "City or ZIP" with "We could not place this business from its address. Where is it?"
- "Services (optional)", "{n} service(s) from Google" or "No services picked yet", "Review", "Not in our list yet: tick to add it as a service; our team reviews new ones." "Used to compare what each rival offers. Towns and ZIPs live in Settings."
- Preview caption "Searching {n} keywords within {n} miles of {client}". Empty "Add a City or ZIP so we know where to search."

### Step 4: Pick who to watch
- Title "Pick who to watch". Subtitle "We're looking for businesses competing for the same customers."
- "We found {n} businesses within {n} miles. Tick up to 5." "Searching {n} keywords across your area..." "{done} of {total} searches. Usually under a minute. You can leave this page; it keeps going." "Checking ads and reviews for {n} businesses. You can leave this page; it keeps going." "We search Google Maps around the service area for the businesses customers compare you with."
- Buttons "Find competitors", "Skip this step", "Tracking", "Show {n} more", "+ Add one we missed", "Ask the owner to pick", "Continue with {n}".
- States "{Name} is choosing the competitors. They show up on their Overview, and we start watching once they have picked." "Competitors are chosen: {n} tracked." "This step was skipped. You can add competitors any time on the Competitors page." "No new businesses were found. You can add competitors by hand later."
- Preview "Where you stand", "Google rating and reviews", "Rivals you tick", "Rating", "Reviews", "Rival". Caption "Live preview. You and the first two rivals you tick. The brief covers all {n}." or "Tick rivals to compare them with {client}."

### Step 5: Invite the owner
- Title "Invite the owner". Subtitle "They get their own sign-in to see the dashboard and every Monday brief."
- "Send {First} an invite", "{email} · from client details", "Invite someone else instead", "Use {First} instead", "Owner's name", "Owner's email". Buttons "Send invite", "Send again", "Skip for now".
- States "Invited {email}. Waiting for them to accept." "{name} accepted." "You asked the owner to pick the competitors. The invite is what emails them, so it can't be skipped."
- Email preview "From: / To:", "Hi {First}, your competitor dashboard is ready", "{Agency} is watching {A, B and C} for {client}. Your first brief arrives on a Monday.", "Open your dashboard". Caption "Preview. The invite email {First} receives, in your brand."

### Step 6: Set up billing (clients and agency admins only)
- Title "Set up billing". Subtitle "{client} pays {agency} directly through your Stripe account."
- "Monthly price", "Setup fee (optional)". Note "{First} gets an email with a payment link for ${n}/month. You can change the price later in the client's Settings."
- Buttons "Turn on billing", "Continue". Dialog "Turn on billing?" "The owner gets an email with a payment link for ${n}/month plus ${n} setup." "Cancel".
- Unchanged notes "Billing for clients starts once your plan is active." "Connect Stripe in Settings → Billing to bill this client."
- Payment preview "Competitor monitoring", "/ month", "Setup fee", "None", "Due today", "Pay with card", "Secure payment by Stripe". Caption "Preview. The payment page {First} opens from the email."

### Step 7: All set (7b when the owner was asked to pick)
- Title "{client} is all set". Subtitle "Check the details. You can change any of them later in Settings." Waiting variant "{First} picks the competitors. Everything else is ready."
- Rows "Business", "Contact", "Area", "Competitors", "Owner", "Billing" with "Edit" or "Pick now". Values "{n} keywords · {n} mi around {city}", "{n} picked", "None picked", "Skipped", "Waiting on {First} to pick competitors", "Invite sent to {First}", "{First} accepted", "Not invited yet", "${n}/month · payment link sent", "Not turned on", "No contact added".
- "What happens next": "We start watching / The starting-point brief is ready within 48 hours." "A brief every Monday / You approve it before {First} sees it." Waiting variant: "{First} picks competitors / They appear on {First}'s Overview. If {First} hasn't picked in 14 days, we start anyway." "We start watching / The starting-point brief is ready within 48 hours of {First}'s picks."
- Buttons "Go to {client}", "Add another client" or "Add another prospect", "Close". Caption "What's next: starting point within 48 hours, then a brief every Monday." or "{First} picks, then the starting point within 48 hours." Image alt "A local storefront under a map pin, linked to two shops in the distance, with a calendar marking the next brief."

### Exit menu and dismissed page
- "Save and exit", "Dismiss setup...", "Dismiss setup?", "Hide setup for this client? You can still edit everything in settings." Buttons "Dismiss setup", "Cancel".
- Dismissed page "Setup dismissed", "The setup for {client} was dismissed.", "Everything can still be edited in settings, and competitors on the Competitors page."

### Refusals shown to staff
- "Add keywords and a location before asking the owner to pick." "Competitors are already chosen for this client." "Invite the owner so they can pick the competitors."
- Place lookup: "We couldn't find that place. Check the City or ZIP." "We couldn't look up that place right now. Try again in a moment." "Looking up a place isn't available right now."

## 4. Setup labels and badge (Portfolio, client page)

- Step status labels: "Searching", "Ready to pick", "Waiting on the owner" (new); "Not started", "Done", "Skipped", "Needs attention" (existing).
- Setup badge (replaces "Finish setup · n of N"): "Setup {n} of {N}", "Setup {n} of {N} · Waiting on {First}", "Waiting on {First}"; fallback "Waiting on the owner".
- Finished-setup summary labels: "Client details", "Find the business", "What they do and where", "Competitors", "Invite the owner", "Billing".

## 5. Owner: Overview welcome and card

- Welcome line "Welcome, {first name}. {agency} set this up for you. Your starting point is on its way." Without a name "Welcome. {agency} set this up for you. Your starting point is on its way." Button "Dismiss".
- Card heading "{agency} asked you to choose who to watch". Body "We found {n} businesses near {city}. Pick up to 5 to compare with you every week." Without the count "Pick up to 5 to compare with you every week." Button "Choose competitors".

## 6. Owner: competitors page

- Label "Choose competitors" (tab title). H1 "Choose who to watch". Subtitle "{agency} found these businesses near {city}. Tick up to 5. You can change them later."
- Exit "Back to Overview". Primary "Confirm {n} competitor(s)" or "Confirm competitors" (disabled with none ticked).

## 7. Public intake (`/start`, `/start/<slug>`)

- Step 1: title "See how you compare with nearby rivals", subtitle "A free snapshot from public information. No card, no sign-up." Platform page only: "We'll match you with a local marketing partner." Labels "Business name", "City or ZIP", buttons "Search" ("Searching…"), "Continue", "Back". Step label "Find your business".
- Step 1 preview "{name or Your business} vs 3 nearby rivals", "Google rating, reviews and map rank", "Your snapshot unlocks after you confirm your email". Caption "Preview. Your free snapshot: you against the three closest rivals."
- Step 2: title "Where should we send it?", step label "Your details", subtitle "We email you a link to your snapshot for {business}." Labels "Your name", "Email", "Phone (optional)", "What would you like help with?" (optional), "I agree to be contacted about my request." (plus "Privacy policy" on the platform page only). Button "Get my free snapshot".
- Step 2 preview "What {agency} does next" (platform: "What happens next"): "Emails your snapshot link / Open it to confirm your email and see the snapshot." "Compares you with nearby rivals / Rating, reviews and map rank, from public information only." "Gets in touch if you asked / Only about your request. No mailing lists." Caption "Your request goes to {agency or a local marketing partner} only."
- Step 3: title "Your snapshot link is on its way", step label "Check your email", subtitle "We sent it to {email}. Open the email to confirm it's you and see your snapshot." Body "Didn't get it? Check your spam folder, or send it again." Buttons "Resend", "Resend in {n} s", "Wrong email? Go back". Messages "You can resend in {n} s", "Sent again." Caption "Almost there. The link works for 48 hours." Image alt "An open envelope with a card rising out of it and a few small sparkles."
- Unchanged: the expired page ("This link has expired." and "Start again.") and the settings-preview note "Disabled in preview".

## 8. Help copy and guides changed in this task

- `account.onboarding` (copy and guide): now four steps, About your agency, Your team, Make it yours, You're all set. The plan tip is gone; tips for About, Team, Brand and Done added; the Skipping tip now names the team and brand steps. The guide gains a "Where is the plan step?" answer.
- `agency.portfolio` guide step 5: the Getting started card lists what is still open (first client, payment method on trial, skipped team or brand step), not "five steps".
- `agency.clients.new` and `agency.prospects.new` (copy and guides): seven screens for a client and six for a prospect (no billing). New tips "About the first screen" and, for clients, the unlisted-business tip rewritten for "Continue without a listing".
- `client.setup` (copy and guide): the staff flow from "What they do and where" on; tips "About the setup screens", new "Ask the owner to pick", "Your first brief", "Keywords and search area". The client-audience tip and client version of the guide are removed (owners no longer reach the staff setup).
- `client.setup.competitors` (owner guide "Choose who to watch"): rewritten for the Overview card, tick up to 5, Confirm, Back to Overview, the 48-hour and 14-day rules, and "A rival is missing" (ask the agency). The page has no tips on purpose (see decision 6).
- The intake has no help key.

## Decisions for the owner

1. Prospects now use the same flow as clients. Contact name, phone and email are required for a prospect too; a `client_owner` contact row is written for it. The last screen's "Close" goes to `/agency` (not the prospect list), and the "Ask the owner to pick" option also shows for prospects. OK, or should prospects keep a lighter form?
2. The intake wording differs from the page before this phase: the heading is now "See how you compare with nearby rivals" (was "Get your free competitor snapshot") and the button is "Search" (was "Find my business"). Both come from the approved mockup. Keep?
3. The mockup's "agency-site" exit link at the top right of the intake is left out, because the agency branding has no website field. Add a website field to the branding later, or leave it out?
4. "Use this for billing too", when off, only points to Settings (Agency profile). The wizard has no billing-address fields. OK?
5. A client can finish setup without a phone or an owner contact; the details step is informational. Staff are not blocked. OK, or should those two be required before setup counts as done?
6. The owner cannot add a missed rival on the pick page. That needs the manage_competitors feature, so the "+ Add one we missed" link shows for staff only. Owners ask the agency (the guide says so). OK?
7. The Stadia geocoding cost of $0.001 per request is an assumption (used for the cost ledger and caps). Please confirm against the Stadia price list.
