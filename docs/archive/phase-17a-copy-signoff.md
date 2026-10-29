# 17a copy sign-off

Owner: mark each row OK or write the edit, then answer "Decisions for the owner" at the end. Source = where the string lives in the code (the code is the source of truth; strings below were copied from it). `{x}` = a value filled in at send or render time. Rows marked **NEW** or **CHANGED** were not in the plan's decided copy and need a ruling first.

## 1. Sign-up page in pilot mode (`apps/web/src/app/sign-up/page.tsx`)
| Where | Copy | OK / edit |
|---|---|---|
| Title | Rival Monday is in pilot | |
| Body | We're opening places to agencies a few at a time. Join the waitlist and we'll email you an invite when yours is ready. | |
| Link | Join the waitlist (goes to the public website's join page) | |
| Note | Already have an invite? Open the link in your invite email. | |
| Footer | Already have an account? Sign in | |

## 2. Confirmed page (`apps/web/src/app/waitlist/confirmed/page.tsx`)
| Where | Copy | OK / edit |
|---|---|---|
| Title | You're confirmed | |
| Body | Thanks — your email is confirmed and your place on the list is saved. We'll be in touch at this address, usually within a few working days. | |
| Expired title | This link has expired | |
| Expired body | Confirmation links work for 7 days, and only the newest one works. Sign up again on rivalmonday.com and we'll send you a fresh link. (link text "rivalmonday.com" goes to the public website's join page) | |
| Browser title | Waitlist | |

## 3. Confirmation emails (`packages/email/src/templates/waitlist-confirmation.tsx`, sent by `packages/tools/src/waitlist/emails.ts`)
Sender name "Rival Monday". Reply-To `support@rivalmonday.app` (**NEW**, see decision 5). Footer: "Sent by Rival Monday".
| Variant | Subject | Body | Button | OK / edit |
|---|---|---|---|---|
| Agency | Confirm your place in the Rival Monday pilot | Hi {contactName}, thanks for asking to join the Rival Monday pilot for {orgName}. Please confirm this is your email address so we can send your invite. | Confirm my email | |
| Agency, asked for a sample (extra paragraph) | (same) | You also asked for a real sample brief for {sampleBusinessName}. Once you've confirmed, we'll build it from public information and email you a link when it's ready. | | |
| Agency, closing | | We open places a few at a time and will email you when yours is ready. The link works for 7 days. If you didn't ask for this, ignore this email and nothing happens. | | |
| Business | Confirm your email for Rival Monday | Hi {contactName}, thanks for your interest in weekly competitor briefs for {orgName}. Please confirm this is your email address. | Confirm my email | |
| Business, closing | | During the pilot we work through local marketing agencies. Once you've confirmed, we'll introduce you to one that serves businesses like yours, and they'll be in touch. The link works for 7 days. If you didn't ask for this, ignore this email. | | |

## 4. Sample-brief-ready email (`packages/email/src/templates/sample-brief-ready.tsx`)
Same sender, Reply-To and footer as section 3.
| Where | Copy | OK / edit |
|---|---|---|
| Subject | Your sample brief for {businessName} is ready | |
| Body | Hi {contactName}, here is the sample starting-point brief we built for {businessName} from public information. | |
| Button | Open the sample brief | |
| Closing | Every statement in it links to the evidence it came from. This is what a client gets in their first week, sent under your agency's name and branding. The link works until {expiresAt}. Questions, or ready to start? Just reply to this email. | |

## 5. Pilot settings panel (`apps/web/src/app/(platform)/platform/billing/pilot-panel.tsx`)
| Where | Copy | OK / edit |
|---|---|---|
| Switch label | Pilot mode | |
| Switch hint | On: open agency sign-up is closed and the site shows the waitlist. Invite links keep working. | |
| Limit label | Sample briefs per month | |
| Limit hint | Approvals beyond this number are refused until next month. | |

## 6. Waitlist page: description, tips, empty states (`apps/web/src/help/copy/platform.ts`, `platform.waitlist`)
| Where | Copy | OK / edit |
|---|---|---|
| Description | People who joined the pilot waitlist from the public website. Invite agencies, pass businesses to an agency and build sample briefs. (**CHANGED**: plan said "from rivalmonday.com"; repo copy tests forbid the product name in short copy, see decision 1) | |
| Tip "About the list" | Only entries whose email address is confirmed can be invited, assigned or given a sample. Unconfirmed entries are shown so you can see demand. | |
| Tip "Sample briefs" | Approving a sample creates the business in the Samples agency and opens its setup. Run setup as usual, approve the starting point in Approvals, then press Send sample here. (**CHANGED**: plan said "the Rival Monday Samples agency") | |
| Empty: Agencies | No agencies yet. Agencies that join the waitlist from the public website appear here. | |
| Empty: Businesses | No businesses yet. Local businesses that join the waitlist from the public website appear here. | |
| Empty: Samples | No sample requests yet. Agencies that ask for a sample brief when they join appear here. | |
| Empty: search | No matches. Nothing on the waitlist matches that search. | |
| Browser title | Waitlist | |

## 7. Waitlist page guide (`docs/help/pages/platform.waitlist.operator.md`)
Read the whole guide once: What this page tells you, How to use it, Common questions (why can't I invite this agency; why is a sample request not counted; where does a sample go after approval; what to do on the competitors step; what Send again does; how long a link works). **CHANGED**: it says "the Samples agency" and "the public website" (decision 1). **NEW** since the plan: the menu badge counts an agency that also asked for a sample twice; do not use "Ask the owner to pick" on a sample's competitors step (no owner, the starting point would wait for the 14-day cap); Send again cancels older sample links; a link ends 30 days after it was sent. OK / edit: ____

## 8. Waitlist statuses (`apps/web/src/lib/labels.ts`)
| Group | Labels | OK / edit |
|---|---|---|
| Entry status | New, Invited, Assigned, Declined | |
| Sample status | Requested, In progress, Sent, Declined, Stopped | |
| Sample stage | Set up the client, Brief being built, **Brief stopped — needs attention** (**NEW**, danger), Brief ready to review, Ready to send, Sent | |

## 9. Waitlist actions and dialogs (`apps/web/src/app/(platform)/platform/waitlist/`)
| Where | Copy | OK / edit |
|---|---|---|
| Bulk buttons | Send pilot invite / Send trial invite | |
| Invite result | Invited {n}. Skipped {m} (not confirmed or already handled). | |
| Decline an entry | Title "Decline {orgName}?"; body "They are not emailed. A sample request from this entry is declined too."; button Decline | |
| Decline result | Declined. | |
| Assign dialog | Title: Assign {orgName} to an agency. Body: Find the business's Google listing, then pick the agency. The agency is emailed and sees it under Leads. Button: Assign. Field: Agency / Choose an agency | |
| Assign result | Assigned to {agencyName}. | |
| Approve sample dialog | Title: Build a sample brief for {sampleBusinessName}. Body: This creates the business in the Rival Monday Samples agency and opens its setup. Confirm the area and tick the rivals as usual, then approve the starting point in Approvals. Nothing is emailed to the business. Button: Approve and open setup. Field: Business type / Choose a business type (the dialog body still names "the Rival Monday Samples agency"; operator-only screen, see decision 1) | |
| Decline a sample request | Title "Decline this sample request?"; body "Nobody is emailed."; button Decline | |
| Stop a sample | Title "Stop this sample?"; body "The business is paused and no link is sent."; button Stop. Result: Stopped. / Declined. | |
| Send sample dialog (**NEW**) | Title: Send the sample brief to {name}? Body: {email} gets a link to the sample that works for 30 days. The sample business is paused. Button: Send (row button: Send sample) | |
| Send again dialog (**NEW**) | Title: Send {name} a fresh sample link? Same body and button. Row button: Send again | |
| Send result (**NEW**) | Sample sent to {orgName}. The link works for 30 days: {link} | |
| Conflict message (**NEW**) | This sample was already handled. (an entry that is already decided shows "This entry was already handled.") | |

## 10. Public sample page (`apps/web/src/app/sample/[token]/page.tsx`)
| Where | Copy | OK / edit |
|---|---|---|
| Browser title (**NEW**) | Sample brief | |
| Label | Sample brief | |
| Heading | Starting point for {businessName} | |
| Intro | Prepared by Rival Monday from public information. Every claim links to the evidence behind it. | |
| Footer | This is the first brief your clients would get, under your agency's brand. This link works until {date}. | |

## 11. Reused 11c lead emails in the waitlist context
Assigning a waitlisted business to an agency sends the existing `lead_new` email (`packages/email/src/templates/lead-new.tsx`, unchanged). Check it reads right for a business that came from the waitlist (the lead has ref "waitlist"; the contact is the waitlisted person).
| Where | Copy | OK / edit |
|---|---|---|
| Subject | New lead: {businessName} | |
| Body | Business: {businessName}; Contact: {contactName} ({email}, {phone}); Ref: waitlist | |
| Button | Review the lead (the pool copy to operators says: Open the lead pool) | |
| Footer | Notice from {agency name} | |

The existing 9a agency invite email (unchanged) is what pilot and trial invites send.

## Decisions for the owner
1. **Reworded copy.** Repo copy tests forbid the product name in short help copy, and guides must use `{{product}}`. So the plan's "rivalmonday.com" became "the public website" and "Rival Monday Samples agency" became "the Samples agency" in the waitlist description, the sample tip and the guide. The approve-sample dialog and the agency's own name still say "Rival Monday Samples". Keep the rewording, or name the site and agency again (needs a copy-test exemption)?
2. **New send copy** (section 9): the Send and Send again dialogs, the "Sample sent to {orgName}" result line, and the "Sample brief" page title. OK?
3. **Stage label** "Brief stopped — needs attention" (a starting point that stopped before review). OK?
4. **"This sample was already handled."** shown when someone declines or stops a sample that is already decided. OK?
5. **Reply-To `support@rivalmonday.app`** on both waitlist emails. Confirm this mailbox exists and you read it, or give another address.
6. The confirmed page link text says "rivalmonday.com" and the pilot sign-up link goes to the same join page. Confirm the domain is rivalmonday.com.
