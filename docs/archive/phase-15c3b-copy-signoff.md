# 15c-3b copy sign-off (plan versions: features and moving agencies)

Owner: tick or edit each table. Status column: **decided** = fixed in the spec (§3.5, §3.6; change only on purpose); **draft** = written by an implementer, needs your approval. `{x}` is filled in live. Everything on the platform console is operator copy; only the email is seen by agency people.

## 1. Email to agency admins (Rival Monday branded)

Source: `packages/email/src/templates/agency-plan-change.tsx`. Carries no operator name.

| Message | Copy | Status |
|---|---|---|
| Subject | "Your Rival Monday plan is changing" | decided |
| Greeting | the usual greeting with the recipient's name | decided |
| Body, live subscription | "From {date, e.g. November 3, 2026}, your plan is ${base}/month including {n} client seats, then ${seat} per extra seat (was ${base} with {n} seats, ${seat} each)." If the date is unknown: "From your next billing date, ..." | decided |
| Body, no subscription yet | "Your plan is now ${base}/month including {n} client seats, then ${seat} per extra seat. These prices apply when you subscribe." | decided |
| Features added | "Now included: {Ask, MCP access}." | decided |
| Features removed | "No longer included: {Ask, MCP access}. This applies straight away." | decided |
| Closing | "Questions? Reply to this email." | decided |

Known gap: with 1 included seat the email reads "1 client seats" (no singular handling). Owner may ask for a fix.

## 2. Platform console: Plans tab (`/platform/billing?tab=plans`)

### Plans table and publish form (`plan-editor.tsx`)

| Where | Copy | Status |
|---|---|---|
| Column heading | "Includes" (after "Trial days") | draft |
| Cell | feature names joined by ", " ("Ask", "MCP access"), or "None" | draft |
| Feature labels (`lib/labels.ts` `PLAN_FEATURE_LABEL`) | "Ask", "MCP access" | draft |
| Form fieldset | legend "Includes"; one checkbox per feature, ticked as the current version has them | draft |
| Form hint | "A new version becomes current for new subscriptions. Existing subscriptions keep their prices." | draft |
| Publish dialog | Title "Publish a new plan version?"; body "It becomes the current plan for new subscriptions. Existing subscriptions keep their prices."; buttons "Publish new version" / "Publish version" | existing |

### Agencies not on the current version (`plan-agencies.tsx`, `plan-move-parts.tsx`)

| Where | Copy | Status |
|---|---|---|
| Section heading (`page.tsx`) | "Agencies not on the current version" | decided |
| Empty state | "Every agency is on the current version." | decided |
| Column headings | "Agency", "Version", "State", "Monthly now → after" (owners also get a checkbox column) | draft |
| Checkbox labels | "Select all agencies"; "Select {agency}" | draft |
| Version cell | "v{n}", or "Not set" when the agency has no version | draft |
| Held row | State chip plus a danger chip "On hold" (checkbox disabled) | decided |
| Price cell | "${now} → ${after}" | draft |
| Button | "Move selected to v{N}" (disabled until one is ticked) | decided |
| Dialog title | "Move {n} agency to v{N}?" / "Move {n} agencies to v{N}?" | draft |
| Dialog line per agency | "{agency} (v{from} → v{N}): ${now} → ${after} a month" | draft |
| Dialog note | "New prices start at each agency's next billing date. Feature changes apply now. Admins are emailed." | decided |
| Seat warning, paid | "Pays for {n} extra seat(s) from the next billing date." | decided |
| Seat warning, over cap | "Over the client limit: new clients can't be activated until they're under it." | decided |
| Confirm button | "Move to v{N}" | draft |
| Result line | "Moved {n}." plus, if some did not move, " {m} not moved: {agency} ({reason}), ..." | decided |
| Reasons (`PLAN_MOVE_REASON_LABEL`) | "On hold", "Cancelled", "Not found", "Stripe error", "Save failed"; "Not moved" if none is given | draft |

## 3. Platform console: agency detail (`/platform/agencies/{id}`)

| Where | Copy | Status |
|---|---|---|
| Billing panel, behind | "Plan v{n}" followed by " (current: v{N})" | draft |
| Billing panel, behind, no version | "Plan version not set" followed by " (current: v{N})" | draft |
| Billing panel, up to date | "Plan v{n}"; "No plan" when none | draft |
| Manage menu item (owner; only when behind and not held, archived or cancelled) | "Move to current plan" | decided |
| Move dialog | Title "Move {agency} to v{N}?"; body = the same price line, warning and note as section 2; button "Move to v{N}"; result line as in section 2 | draft |

## 4. Guides (`docs/help/pages/`)

- `platform.billing.operator.md`: the Plans bullet mentions what a version includes; new bullet "Agencies not on the current version"; how-to step 3 "Move agencies to the current version".
- `platform.agencies.detail.operator.md`: Billing bullet mentions the plan version and "Plan version not set"; Managing people step 6 "Move to the current plan".

## Decisions for the owner

1. Email "1 client seats" when a version includes one seat: fix the plural, or leave?
2. Approve the "draft" rows above, or mark the edits in place.

Owner sign-off: ____________________   Date: ____________
