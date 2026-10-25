# 15c-2 copy sign-off

Owner: tick or edit each item. Source of truth is the code named per item.

## 15c-2a

Page groups below: Platform, Agency, Account and public. Task numbers (T3-T16) point to the plan. Source of truth is the code; each table names the page it lives on.

### Owner decisions (open copy and policy questions)
**Signed off by the owner 2026-10-23: all copy approved as written; proposals in 3 (drop the contrast line), 6 ("Download client report (CSV)") and 8 (drop "Sent" from the cell) accepted — applied in 15c-2b Task 0. Everything else stays as built.**
1. **Privacy URL (B12).** Sign-up and platform /start link to `https://rivalmonday.app/privacy`. Confirm the URL (the page must exist before launch). Agencies have no privacy URL of their own yet (backlog).
2. **"as Agency admin" grammar.** The invite email reads "invited you to join {agency} as Agency admin" / "as Account manager". Keep, or switch to "as an Agency admin"?
3. **Branding contrast line.** "Buttons will use dark text so they stay readable." now also shows for the default blue #47A8E7 (ink label on primary, design system v1). Proposal: drop the line.
4. **"Waiting …" age wording** on alert review (final fix wave): from elapsed time — "Waiting under an hour", "Waiting 1 hour" / "Waiting 3 hours", "Waiting 1 day" / "Waiting 2 days". Alerts already approved and held for the digest show no age. OK?
13. **Team invite cap (final-review ruling).** Agency staff invites are capped at 20 per agency in 24 hours (new invites and resends together); the 21st reads "You've sent a lot of invites today. Try again tomorrow." Keep 20 and the wording?
5. **Agency /start/v "What happens next".** "{Agency} has your details and will be in touch about next steps." replaces "within one business day". The agency has no site link, so the panel has no button (backlog: agency site URL).
6. **"Download seat report (CSV)"** on agency billing: the page now says "Clients" everywhere else. Rename to "Download client report (CSV)"?
7. **Topic proposal approve copy (T16).** "...reviews with no topic are checked against it" and the sweep selection (last 180 days): confirm the wording.
8. **Team page "Sent" header** and the cell "Sent {date} · expires {date}" repeat the word. Drop it from the cell?
9. **Resend inviter.** A resent invite names the person who pressed Resend as the inviter (and reply-to), not the original inviter. OK?
10. **Webhook test, "network" line.** "Test failed — couldn't reach {Slack / Teams}." was added (not in the mockup). OK?
11. **No "Webhook deleted." line.** After Delete the row just disappears; no confirmation message. OK, or add one?
12. **Resend result when the email fails** ("Invite renewed for 14 days, but the email couldn't be sent…") was added (not in the mockup). OK?


### Platform

#### Platform > Agencies (T3)
| Where | Copy |
|---|---|
| Search label | Search agencies |
| Search button / clear link | Search / Clear |
| No match | No agencies match “{q}”. |
| Created / last activity | "Oct 21" in the current year, "Oct 21, 2025" otherwise; last activity relative ("yesterday", "4 days ago") then a date; in the viewer's time zone |
| Previous / Next | ‹ Previous / Next › |

#### AGENCY_HEALTH (`apps/web/src/lib/labels.ts`)
| Value | Label | Tone |
|---|---|---|
| at_risk | At risk | danger |
| idle | Idle | warning |
| growing | Growing | success |
| steady | Steady | info |

The Billing column now uses BILLING_STATE labels (Free trial, Payment overdue, Read-only, ...) instead of the old platform pill words (Trial, Past due, Paused).

#### Platform > Lead pool and Model reviews (T4)
| Where | Copy |
|---|---|
| Lead pool card title | Pool ({total}) |
| Verified column, not verified | — |
| Assign picker label (screen reader) | Agency for {business name} |
| Assign picker option | {Agency} — {business type names} · {n} active client(s) (names, not slugs) |
| After assigning | Assigned. (stays on screen after the lead leaves the list) |
| Returned lead chip | Declined by an agency |
| Model reviews heading | Waiting for review ({total}) |
| Review card header | {competitor} · {source label} · {change kind} · {age, e.g. "3 days ago"} |
| Paging | ‹ Previous / Next ›, 25 per page |
| Empty page of a non-empty list (stale link; lead pool and model reviews) | Nothing on this page. Go to the first page (link) — the real empty state stays for an empty list |
| Lead pool tip "What is in the pool" | ...The list is newest first, 25 at a time; use Previous and Next for more. |
| Model reviews tip "Answering a review" | ...The queue is oldest first, 25 at a time; use Previous and Next for more. |

#### Platform > Billing & plans (T5)
| Where | Copy |
|---|---|
| Tabs (`?tab=`, order) | Overview · Plans · Discount codes · Sign-up & invites · Stripe Connect |
| Overview chips | Billing state labels from BILLING_STATE (Pilot, Free trial, Active, Payment overdue, Read-only, Suspended, Cancelled) |
| Pause sign-ups: title / body / confirm | Pause new sign-ups? / New agencies can't sign up until you resume. Invite links still work. / Pause sign-ups |
| Resume sign-ups: title / body / confirm | Resume sign-ups? / New agencies can sign up on their own again. / Resume sign-ups |
| Publish plan: title / body / confirm | Publish a new plan version? / It becomes the current plan for new subscriptions. Existing subscriptions keep their prices. / Publish version |
| Revoke code: title / body / confirm | Revoke this discount code? / It can no longer be used. Subscriptions that already have it keep their discount. / Revoke code |
| Revoke invite link: title / body / confirm | Revoke this invite link? / Nobody can join through it afterwards. Agencies that already joined stay. / Revoke link |
| Default Connect fee: title / body / confirm | Change the default platform fee? / The new fee applies to Checkout links created from now on. Existing subscriptions keep their fee. / Save fee |
| Agency Connect fee: title / body / confirm | Change this agency's platform fee? / A blank fee clears the override so the default applies. A new fee applies to Checkout links created from now on; existing subscriptions keep their fee. / Save fee |
| Dates (plans created, code expiry, link expiry) | "Oct 21" in the current year, "Oct 21, 2025" otherwise, in the viewer's time zone |
| Cost items dates | "Oct 1 → ongoing" / "Oct 1 → Dec 31" (calendar days, no zone shift) |
| Guide / page description | Mention the five tabs and the confirms |

Note: "Invite links still work" while sign-ups are paused is confirmed in `packages/tools/src/access/signup.ts` (only the open sign-up path checks `signupsPaused`).

#### Platform > other pages sweep (T6)
| Where | Copy |
|---|---|
| HEALTH_STATUS chips (Health page) | Working (ok) · Slow (warn) · Down (down); tips and guide reworded from OK / Watch to Working / Slow |
| INVOICE_STATUS chips | Draft · Open · Paid · Uncollectible · Voided |
| Billing event reasons | Subscription started · Payment failed · Subscription ended · Set to cancel at period end · Free trial ended · Payment overdue for 7 days · Read-only for 30 days · Suspended for 90 days · Pilot ended · Cancellation date reached · Pilot granted by staff · Pilot ended by staff · Trial extended by staff (unknown reason: sentence case without its prefix) |
| Billing event line | {Oct 12, 2025} · {from chip} → {to chip} · {reason}; a first event reads "Started as {chip}" |
| End pilot: title / body / confirm | End this pilot? / The pilot ends now and the free trial starts. / End pilot |
| Grant pilot: title / body / confirm | Grant a pilot? / The agency moves to a pilot with no card needed, until the end date if you set one. / Grant pilot |
| Extend trial: title / body / confirm | Extend the free trial? / The trial runs until the date you chose. / Extend trial |
| Attach discount: title / body / confirm | Attach this discount? / The discount applies to this agency's subscription, or at checkout if it has none yet. / Attach discount |
| Pilot client cap: title / body / confirm | Lift the pilot client cap? / The agency can add more clients than the standard cap while it is in pilot. / Lift cap (restore: Restore the pilot client cap? / The agency goes back to the standard client cap while it is in pilot. / Restore cap) |
| Ask reviews chips | {n} removed · Something went wrong · Couldn't answer · Limit reached (replace "error", "refused", "quota"); tip renamed "The status chips" and reworded to match |
| Ask thread | Speaker: Client / {the agency's assistant name, default Friday} / Tool (any other role in sentence case); status chip from ASK_MESSAGE_STATUS (Answered, Limit reached, Couldn't answer, Something went wrong, Stopped); message time in the viewer's zone; "Action" and "Trace" JSON now inside a closed "Technical details" toggle; tip "Citations and technical details" reworded |
| Business types: Approve vertical / service | Approve {name}? / It joins the business type list that every agency can choose from. (service: ...the {type} service list...) / Approve |
| Business types: Merge vertical / service | Merge {name} into {target}? / Agencies and clients using it move to the other business type. This cannot be undone. (service: Clients using it move to the other service. ...) / Merge |
| Runbook: switch off | Switch off {item}? / It stops applying to briefs and alerts until you switch it back on. / Switch off |
| Runbook: remove | Remove this {play, rule or setting}? / It is no longer in the {standard runbook, agency runbook}. Removing it deletes it from this runbook. / Remove |
| Runbook: use update on a customised item | Replace your version? / Your edits to this {play, rule or setting} are replaced by the version from the {standard runbook, agency runbook}. / Use the update |
| Runbook chips | Trigger shown as "Price change" (was "price change"); inheritance badges become chips |
| Billing states tip | Reworded to the chip labels (Free trial, Payment overdue, Read-only) |
| Dates | Overview activity: "Oct 21, 9:00 AM CT"; support sessions, health "last success" tooltip, knowledge "Synced Oct 5" in the viewer's zone |

Not changed: the "Agency management is coming soon" line (15c-3). Overview charts still pass ISO keys to LineChart, which already prints "Oct 20" and "Oct 2026" (checked, nothing to change).

#### Platform > Topic proposals (T16)
| Where | Copy |
|---|---|
| Status chips (TOPIC_PROPOSAL_STATUS) | Waiting for review (proposed) · Approved · Rejected |
| Pending card line | {Status chip} {Business type} · {n} reviews with no topic · Proposed {2 days ago} |
| Approve: title / body / confirm | Approve {name}? / It becomes a topic that reviews are sorted into, and the last 180 days of reviews with no topic are checked against it. / Approve |
| Reject: title / body / confirm | Reject {name}? / It is not added to the topic list. This cannot be undone. / Reject (danger) |
| Recently decided | Decision as a chip; date as "Oct 7" (viewer's zone) |
| Knowledge article "Updated" line | Shared formatter: "Updated Oct 1, 2026" (unchanged, year always shown) |


### Agency

#### Agency > Alert review (T7)
| Where | Copy |
|---|---|
| Client filter label / default option | Client / All clients (options "{client} ({n})") |
| Filter button | Show |
| Cap notice (only when 200 rows are shown) | Showing the oldest 200 — filter by client to see more; with a client chosen: "Showing the oldest 200 for this client." |
| Client filter, chosen client with nothing queued | The select keeps it selected, named "{client}" when known, else "This client" (never "All clients") |
| Age on each alert (waiting for review only) | Waiting under an hour / Waiting {n} hour(s) / Waiting {n} day(s); none on alerts held for the digest |
| Expiry hint (alerts waiting for review only) | Expires if not reviewed within 7 days |
| Status chip | Waiting for review / Approved (ALERT_STATUS) plus "Held for the 17:00 digest" |
| Dismiss dialog | Title "Dismiss this alert?"; body "Nothing is sent to the client." + field "Reason" (required, up to 500); buttons Cancel / Dismiss |
| Page description (added sentence) | ...The list shows the oldest 200; filter by client to see more. |

#### Agency > Portfolio, Approvals, Prospects, Leads (T8)
| Where | Copy |
|---|---|
| Portfolio approve link | Approve Week of Oct 12 (was the ISO date) |
| Pause dialog (client billing / client profile) | Title "Pause billing for {client}?"; body "{client} stops getting new checks, briefs and alerts, no longer takes a seat, and billing for it pauses. Everything collected so far stays, and you can resume any time."; buttons Cancel / Pause |
| Resume dialog | Title "Resume {client}?"; body "Weekly checks, briefs and alerts start again for {client}, and it takes a seat. Resuming is refused if it would put you over your client limit."; buttons Cancel / Resume |
| Billing pill | Chip with the same words (Paused / Payment needed / Invited / Paying / Off) |
| Brief status (BRIEF_STATUS) | Drafting / Ready for review (was "Needs review") / Approved / Sent / Failed — retrying; the Status tip uses the same words |
| Approvals empty, nothing at all | "No briefs this week" (was "Nothing to review this week"); body unchanged |
| Approvals, briefs exist but none ready | "Nothing is waiting for your review. Nothing below needs a decision from you right now." |
| Approvals columns | Week column reads "Week of Oct 12"; last (flag) column named "Actions" for screen readers |
| Brief review title | "{client} · Week of Oct 26" |
| Send time | Approve button "Approve · send Monday 7:00 AM CT"; switch "Send untouched briefs automatically on Monday 7:00 AM CT" (zone = the client's) |
| After approving a weekly brief | Approved — it goes out Monday 7:00 AM CT. {n} recommendation(s) created. (zone = the client's; was "Monday 07:00") |
| Rating buttons | Useful / Not useful, announced as pressed once saved |
| Prospects | "Ready" / "Needs setup" chips; snapshot chip Preparing / Ready / Sent / Failed (REPORT_STATUS) |
| Leads | Chip with the lead status (Verified / Accepted / Declined); date "Oct 1" in your time zone |
| KPI tiles | Same titles; "Alerts waiting" and "Briefs to approve" are links with an arrow |

#### Agency settings and onboarding (T9)
| Where | Copy |
|---|---|
| Billing status chip | BILLING_STATE labels: Pilot, Free trial, Active, Payment overdue, Read-only, Suspended, Cancelled (was Trial / Paused on this page) |
| Billing count line | Clients: {used} of {included} included, {n} extra. (was "Seats: ...") |
| Billing invoice status | Chip with INVOICE_STATUS label (was raw lower-case word) |
| Client billing, price help | A new price applies to new sign-ups; existing subscriptions are unchanged. |
| Client billing, setup fee help | Leave blank to keep the current fee. Enter 0 for no setup fee. |
| Client billing, pause help | Leave blank to never pause automatically. |
| Client billing save bar | Save defaults (appears when a field changes), Discard |
| Disconnect Stripe dialog | Title "Disconnect Stripe?", body unchanged, confirm "Yes, disconnect" (red, inside the dialog) |
| Branding, between logo URL and upload | or |
| Branding, under Primary colour | Buttons will use dark text so they stay readable. (Shown whenever the chosen primary gets dark text. With design system v1 this now includes the default blue #47A8E7; propose dropping the line if you prefer.) |
| Branding save bar | Save changes (appears when something changes), Discard |
| AI connections dates | "Oct 21" / "Oct 21, 2025" in the viewer's time zone (was 2026-10-21) |
| Onboarding, required fields | "Required" under Agency name, Contact name, Contact email, Phone |
| Onboarding team step | Role defaults to Account manager |
| Onboarding last step button | Save and finish (was Save and continue) |
| Onboarding plan step | Plan state as chip (Read-only, not Paused); new line "{price} per month, includes {n} clients; each extra client {price} per month." |
| Billing guide / tips | "Seats" renamed "Clients"; "Paused" state renamed "Read-only"; "Trial" renamed "Free trial" (guide and help tips) |

#### Agency settings > Slack & Teams (T10)
| Where | Copy |
|---|---|
| Webhook row, kind chip | WEBHOOK_KIND labels: Slack, Microsoft Teams |
| Webhook row, state chip | On / Off (beside the switch; a read-only support session sees only the chip) |
| Notices column and the add form's checkboxes | AGENCY_NOTICE_KIND labels: Client alerts (agency), Brief ready for review, Brief failed, Brief overdue, Competitor suggestions ready, Client updated their setup, Setup waiting on you, Quarterly report, Rank scan skipped, Contact bouncing (unchanged wording, now one map); none ticked = "All agency notices" |
| Row buttons | Send test · Delete |
| Delete dialog | Title "Delete this webhook?", body "Briefs and alerts stop going to this {Slack channel / Teams channel}. You can add it again later.", confirm "Delete" (red, inside the dialog) |
| Test result, sent | Test sent — {Slack / Teams} answered {status}. |
| Test result, timeout | Test failed — {Slack / Teams} didn't answer within 5 seconds. |
| Test result, address refused | Test failed — this address isn't a Slack or Teams webhook. |
| Test result, other status (incl. a redirect) | Test failed — {Slack / Teams} answered {status}. |
| Test result, unreachable (new, not in the mockup) | Test failed — couldn't reach {Slack / Teams}. |
| Test refused, 6th in 10 minutes | You can send another test in a few minutes. |
| Message posted to the channel | Title "Test message from {agency display name}", body "Briefs and alerts from {agency display name} will appear in this channel." (no link) |
| Switch refused | The switch flips back and shows the refusal beside it (was silently ignored) |

#### Agency settings > Team: resend + `team_invite` email (T11)
| Where | Copy |
|---|---|
| `team_invite` email, subject | {inviterName} invited you to {agencyName} |
| `team_invite` email, body | {inviterName} has invited you to join {agencyName} as {roleLabel}. Sign in with this email address to accept. This invite expires on {expiryDate}. ({roleLabel} = "Agency admin" / "Account manager"; {expiryDate} e.g. "Nov 6, 2026", UTC; {inviterName} = the inviter's name, else their email) |
| `team_invite` email, button / footer | Sign in · footer "Invitation from {agency display name}" (same footer as `client_invite`); reply-to is the inviter |
| Invite sent (any role) | Invitation sent to {email}. (agency staff now get an email too; was "Invitation created. Ask them to sign in …") |
| Invite created, email not sent | Invitation created, but the email couldn't be sent. Ask them to sign in at {appUrl}/sign-in with this email. |
| Pending invitations, date column | Header "Sent"; cell "Sent {date} · expires {date}" (viewer's time zone; was an "Expires" column) |
| Invite row buttons | Resend · Revoke (screen readers: "Resend invite to {email}", "Revoke invite to {email}") |
| Resend result | Invite sent again. |
| Resend, email not sent (new, not in the mockup) | Invite renewed for 14 days, but the email couldn't be sent. Ask them to sign in at {appUrl}/sign-in with this email. |
| Resend refused, 4th in 24 h | You can resend this invite again tomorrow. |
| Invite or resend refused, 21st agency staff invite email in 24 h (final-review ruling) | You've sent a lot of invites today. Try again tomorrow. |
| Revoke dialog | Title "Revoke the invitation to {email}?", body "They will no longer be able to accept it.", confirm "Revoke" (red, inside the dialog) — unchanged wording, now `ConfirmDialog` |
| Remove dialog | Title "Remove {name}?", body unchanged, confirm "Remove" (red, inside the dialog); a refusal (last admin) shows beside the button |
| Role labels (MEMBERSHIP_ROLE, B14) | Agency admin (was "Admin"), Account manager, Client owner, Client viewer — Team page, invite form, help tip and guide |
| Invitations tip | An invitation is an email asking the person to sign in with that address; it works for 14 days. Each row shows when it was sent and when it expires. Resend emails it again and gives it another 14 days, up to 3 times a day. Revoke cancels it. Someone who already has access at that level cannot be invited again: remove them first to change their role. |
| Team guide | "Agency admin" in the roles list; step 3 now explains Resend (another 14 days, up to 3 times a day); the "expired invitation" answer adds "To keep an invitation from expiring, use *Resend* before the date shown." |

#### Agency settings > Intake preview (T12)
| Where | Copy |
|---|---|
| Intake link card | Button "Preview your page" (opens the preview) |
| Page title / breadcrumb | Intake preview · Agency settings › Intake link › Preview |
| Page description (help) | What visitors see on your intake page. Nothing here can be submitted. |
| Frame bar | Preview — this is what visitors see |
| Frame bar, link off | Link is off · visitors can't open it yet |
| Buttons note | Disabled in preview (beside "Find my business" and "Get my free snapshot") |
| Intake preview guide | New guide: what the preview shows, that it is not the live page, how to turn the link on |
| Copied button HTML | Text colour now follows the agency colour (dark ink on light colours, white on dark); no wording change |


### Account and public

#### Account and public pages (T13)
| Where | Copy |
|---|---|
| Inbox, unread row | Chip "New" (screen readers: "<title> (new), <time>, <client>. <body>") |
| Notification settings, saved | "Saved." (under the quiet-hours form; a "Save" bar appears while it has unsaved changes) |
| Notification settings, failed toggle | The refusal message from the save, shown beside the switch; the switch returns to its stored state |
| Sign-up | "Already have an account? Sign in" |
| Sign-up privacy line | "By creating an account you agree to how we handle your details, as described in our privacy policy." (links to https://rivalmonday.app/privacy, **owner to confirm the URL**) |
| /start, stage 2 heading | "Your details" |
| /start consent (platform page only) | "I agree to be contacted about my request. Privacy policy" (same URL; agency intake pages show no link) |
| /start/v, new panel | Heading "What happens next" |
| /start/v, agency | "<Agency> has your details and will be in touch about next steps." (replaces "will be in touch within one business day") |
| /start/v, platform | "We'll match you with a local marketing partner and they'll be in touch." (unchanged) + link "Back to the start page" |
| /start/v nearby table | Column "Distance" (values "0.8 mi", "3 mi"; was "Distance (mi)") |

#### Sign-in / sign-up: resend email (T14)
| Where | Copy |
|---|---|
| Check your email (sign-in and sign-up) | Button "Resend email" (outline, under the existing copy) |
| After any resend click | Button "Resend in {n} s" (disabled, counts down from 60) |
| Result line (every outcome: sent, unknown address, limit reached) | "If that address can sign in, a new email is on its way." |
| Resend after the 15-minute window | The button becomes a link "Start again" (to `/sign-in` or `/sign-up`) |

## 15c-2b

### 2b-1

Page groups: Ask, Platform > Ask, Changes, Evidence, Moves, plus the 15c-2a items applied in Task 0. Source of truth is the code; each row names file:line (paths under `apps/web/src/`).

### Owner decisions
1. **Reviewers can read a deleted conversation (P17).** Is saying reviewers can still read a deleted conversation (while review is allowed) the wording you want? Client guides now read: "Delete a conversation with the bin icon beside it and confirm. It leaves your list for good. While conversations may be reviewed (the line under the box), the people it names can still read it."
2. **Client `privacy` tip.** `help/copy/client.ts:325` still ends "Delete a thread with the bin icon beside it." Add the P17 sentence there too (and say "conversation")?

#### Ask > delete (client)
| Where | Copy |
|---|---|
| Bin button label / tooltip (`components/ask/thread-list.tsx:33-34`) | aria-label "Delete conversation “{title}”"; tooltip "Delete conversation" |
| Dialog title / body / button (`thread-list.tsx:40-42`) | "Delete this conversation?" / "It disappears from your list. This can't be undone." / "Delete" (danger) |
| Row error (`thread-list.tsx:22-25`, `ask/actions.ts:134-135`) | The tool's error text under the row (e.g. "Not found"); cleared on the next attempt |
| Deleted in another tab (`components/ask/ask-chat.tsx:159-176`) | No message: the next question opens a new conversation |
| Guides (`docs/help/pages/client.ask.client.md:23`, `client.ask.thread.md:19`) | P17 paragraph above; "Its messages are deleted with it." removed |

#### Platform > Ask (operator)
| Where | Copy |
|---|---|
| List chip (`app/(platform)/platform/ask/page.tsx:63`) | Chip (neutral) "Deleted by user" |
| Thread subtitle (`platform/ask/[threadId]/page.tsx:59`) | Chip "Deleted by user" then "Deleted {date, time, zone}." |
| Flags tip (`help/copy/platform.ts:292`) | "... Deleted by user: the person removed it from their list; it stays here for review." |
| Guides (`docs/help/pages/platform.ask.operator.md:16`, `platform.ask.thread.operator.md:8`) | Same sentence |

#### Changes (`app/(app)/c/[clientId]/changes/`)
| Where | Copy |
|---|---|
| Tab label (`viewer.tsx:28`) | "Whole page" (web changes with an after capture only) |
| Tabs nav label (`viewer.tsx:205`) | "Evidence views" (aria-label) |
| `ListDetail` titles (`page.tsx:118-119`) | list region "Changes"; phone sheet title "Change details" |

#### Moves (`app/(app)/c/[clientId]/moves/page.tsx:156-157`)
| Where | Copy |
|---|---|
| `ListDetail` titles | list region "Moves"; phone sheet title "Move details" |

#### Whole-page diff (`components/whole-page-diff.tsx`)
| Where | Copy |
|---|---|
| Chips (`:30`) | "Added" (success) / "Removed" (danger) / "Changed" (info) |
| Header (`:93`) | "Compared with the capture from {date, time, zone}" |
| Collapsed run (`:79`) | "{n} unchanged sections" (runs of more than 2) |
| Masked (`:69`) | "{n} sections change on every visit and are hidden." (one section: "1 section changes on every visit and is hidden.") |
| Truncated (`:70`) | "This page changed too much to compare word by word, so some sections show as removed and added in full." |
| Too long (capped at 600 sections) | "This page is too long to compare in full, so only the first part is shown." |
| First capture (`:66`) | "This is the first capture of this page, so there is nothing to compare yet." |
| No blocks / not web (`:67`) | "Comparison not available for this capture." |
| No differences (`:71`) | "No differences on this page." |
| Screen-reader text (`:38,42`) | "added: {text}" / "removed: {text}" |
| Evidence page section (`evidence/[evidenceId]/page.tsx:169`) | Heading "Compare with previous" (web captures) |

#### Applied from 15c-2a sign-off (Task 0, for the record)
| Where | Copy |
|---|---|
| Branding editor (`components/agency/branding-editor.tsx:121`) | "Buttons will use dark text so they stay readable." removed |
| Agency billing (`agency/settings/billing/page.tsx:118`, guide `agency.settings.billing.agency.md:11`) | "Download client report (CSV)" |
| Team invites cell (`agency/settings/team/page.tsx:119`) | "{date} · expires {date}" (no "Sent") |

### 2b-2

Client-page sweep. Paths are under `apps/web/src/` and refer to the code at the end of the branch; the source of truth is the code. Labels come from the shared maps in `lib/labels.ts` (same text everywhere a status shows).

### Owner decisions (2b-2)
**Approved by the owner 2026-10-24:** all 2b-2 copy and decisions 1–10 as written (2: tool refusal wording left for a later tool pass; 4: tokens in phase-16; 5: wording kept).

1. **Changes on a phone (P2).** Rows are no longer announced as "current" below `lg:` (the detail pane is hidden there; tapping opens the sheet). On desktop the open row still carries `aria-current`. OK?
2. **Tool refusal still says "place id" (P4).** UI, guides and help now say "Google Place ID". The refusal text from the tool (`packages/tools/src/client-input.ts:52`, "Google place id looks wrong") is unchanged because this phase changes no tool. Leave it for a later tool pass?
3. **Band bar shows no examples (P10).** Settings > Alert rules draws the three bands with their score ranges only, no example changes. OK?
4. **Colours left as hex (phase-16).** No token exists for them, so they stay: disabled button `bg-[#CBD5E1]` (`competitors/competitor-controls.tsx`), unticked suggestion border `#CBD5E1` (`competitors/signal-pills.tsx`), tier chips `#E2E8F0`/`#F1F5F9`/`#4A5D73` (competitors tier chip), heatmap constants INK/WHITE/LINE and sentiment fills (`components/charts/topic-heatmap.tsx:3-5`). Add tokens in phase-16?
5. **Capture status wording for owners.** `CAPTURE_STATUS` (`lib/labels.ts`) now shows to client owners: "Captured", "No change since last capture", "Blocked by the site", "Site asks not to be monitored", "Data provider error", "Timed out", "Failed". OK for owners, or soften "Blocked by the site"?
6. **Guides still say "3 instant alerts a day".** The page uses the engine constant (`ALERTS_PER_DAY`), but guide Markdown cannot interpolate it (`docs/help/pages/client.settings.alerts.agency.md:20,29`, `client.settings.delivery.agency.md:21`, `client.alerts.detail.agency.md`, `client.changes.agency.md`, `agency.alerts.agency.md`). Fine while the limit is 3?
7. **Status wording.** Briefs and alerts no longer say "Needs review": briefs "Ready for review", alerts "Waiting for review" / "Being drafted". The agency approvals guides (`agency.approvals.agency.md:10,16`, `agency.approvals.detail.agency.md:33`) were changed to "Ready for review" in the final wave too.
8. **Heatmap tooltip is shorter.** The cell tooltip is now "{business}, {topic}: 34% · Positive · ▲ 8 pts" (same text as the table). It no longer says "vs previous 90 days" or explains the share; the guides and the page tip carry that. OK?
9. **Alert-rules page lost a sentence.** "Below {n}: archived — still visible under Changes." is gone from `settings/alerts/page.tsx`; the band bar and its legend replace the three plain-words lines.
10. **New copy, needs approval: billing confirm.** Setup › Billing now asks before it emails the owner (`setup/steps/billing-step.tsx`): title "Turn on billing?", body "The owner gets an email with a payment link for $249/month plus $99 setup." (the "plus … setup" part only when a fee is typed), confirm button "Turn on billing", Cancel sends nothing. OK?

#### Status and enum labels (`lib/labels.ts`, shared maps)
| Map | Labels |
|---|---|
| `PAGE_TYPE` | Home page, Pricing, Service, Service area, Promotion, Careers, Team, About, Contact, Blog, Other |
| `BRIEF_ITEM_STATUS` (agency only) | Included, Dropped (was raw "dropped") |
| `MOVE_STATUS` | Emerging, Active, Fading, Closed |
| `LEVEL` | Low, Medium, High (was L / M / H) |
| `CAPTURE_STATUS` | Captured, No change since last capture, Blocked by the site, Site asks not to be monitored, Data provider error, Timed out, Failed (decision 5) |
| `EVENT_ROUTE` | Alert, Brief, Archived |
| `SETUP_STEP_STATUS` | Not started, Running, Done, Skipped, Needs attention |
| `CLIENT_PLAN_STATUS` | Paused, Not set up, Active, Payment needed, Awaiting payment setup, Cancelled, Not available |
| `AD_STATE` | Active, Ended |
| `RECOMMENDATION_STATUS` | To do, In progress, Done, Dismissed |

#### Overview (`app/(app)/c/[clientId]/`)
| Where | Copy |
|---|---|
| Brief links (`overview-kpis.ts:87`) | "Brief · Week of Oct 19" / "Starting point · Oct 15" (was ISO dates) |
| Brief list status (`components/client-lists.tsx:19-33`, `BriefStatusChip`) | Agency sees a chip (Ready for review, Approved, Sent...); client roles see none |
| No Place ID (`overview-kpis.ts:62`) | "Add your Google Place ID to compare" (was "place id") |
| Recommendations open (`page.tsx`) | Chip from the shared labels: To do / In progress |

#### Changes and Moves
| Where | Copy |
|---|---|
| Captured (`changes/viewer.tsx`) | Date, time and the client's zone ("Oct 12, 9:00 AM CT"), not the UTC string |
| Capture status (`viewer.tsx`) | Chip from `CAPTURE_STATUS` (decision 5) |
| Route pill (`changes/feed.tsx`) | Chip "Alert" (red) / "Brief" (amber) / "Archived"; hover title and screen-reader text name the score |
| Move card (`moves/move-card.tsx:47,66`) | "Active · 3 changes over 14 days · confidence 80%" (was "3 signals") |
| Move tip (`help/copy/client.ts`, key `client.moves.signals`) | Title "Changes behind a move" (was "Signals on a move"); body "A move is backed by changes: “3 changes” means three changes by this competitor fit the pattern. The list shows each one with its evidence. They are not the signal pills on the Competitors page." Guide `client.moves.*` lines 10/12 follow |
| Tips | Moved beside the card titles, not inside them |

#### Competitors and competitor profile
| Where | Copy |
|---|---|
| Google Place ID (`competitors/competitor-controls.tsx:286,395`, `overview-kpis.ts:62`, setup, 6 agency guides, help copy) | "Google place id" -> "Google Place ID" |
| Empty room (`competitor-controls.tsx:312`) | "{agency} can look for more competitors for you." |
| Stop tracking (`competitor-controls.tsx:410-412`) | Asks first: title "Stop tracking {name}?", button "Stop tracking", Cancel keeps it; a refusal shows on that row |
| Since column (`competitor-controls.tsx:473,495`) | "Oct 13" in the client zone (was a long weekday date) |
| Rated (`components/rival/rated-label.ts:5`) | "Rated Oct 13" (was "Rated Tue 13 Oct") |
| No rating (`competitors/[competitorId]/page.tsx:147`) | "No rating yet" |
| Pages table | Page type and cadence in words (Home page, Pricing, Service area, Daily, Weekly); Inactive as a chip |
| Collection status | Relative time in the client zone, "· Paused" when paused; a site that blocks monitoring shows a red chip |
| Score factors (`changes/viewer.tsx:37`, `FactorBar`) | Accessible name "{label} {value}", e.g. "Relevance 0.80" |

#### Pricing, Ads, Reviews
| Where | Copy |
|---|---|
| Price tag (`pricing/price-card.tsx:44`) | "Promo" (was "PROMO"); help copy `client.ts:168` and `client.pricing.md:13` follow |
| Prices | Cents kept ("$89.50"); empty price cells hidden; "See pricing" hidden when none |
| Ad state (ad cards) | Chip "Active" / "Ended"; dates in the client zone |
| Review line (`reviews/review-item.tsx:6`) | "Google reviewer · on your profile" for the client's own reviews; dates "Oct 3" |
| Ads Apply / Reviews Search buttons | Label colour is ink on the primary colour (was white) |

#### Rankings
| Where | Copy |
|---|---|
| Dates (`rankings/page.tsx`) | Scan names and "Scan of ..." in the profile zone, short form |
| Keyword limit (`rankings/rank-settings-sheet.tsx:73`) | "That is the most keywords one scan can cover. Untick one to pick another." |

#### Recommendations
| Where | Copy |
|---|---|
| Chips (`components/recommendation-board.tsx:125`) | "Effort: Low" / "Impact: High"; owner "For you" (client roles) / "Client" (agency view) / "Agency" |
| Empty column (`recommendation-board.tsx:146`) | "Nothing here yet." |
| Tip `owner` (`help/copy/client.ts`) | Title "For you or Agency"; body adds "Agency users see "For you" as "Client"." |
| Tip `effortImpact` (`help/copy/client.ts`) | "Rough estimates, shown as Low, Medium or High: how much work the step is (Effort) and how much it could help (Impact). …" (was "L, M or H for low, medium or high") |
| Guides (`client.recommendations.client.md:11,35`, `.agency.md:12,42-44`) | "Low, Medium or High"; agency guide says **Client** or **Agency**; FAQ "What does "Client" mean on a card?" — "A step the business owner can take; the client sees it as **For you**. **Agency** marks a step your agency can take." |

#### Briefs, Alerts, Reports, Pitch snapshot
| Where | Copy |
|---|---|
| Status chips (`lib/labels.ts:60,61,87`) | "Needs review" -> briefs "Ready for review"; alerts "Waiting for review" / "Being drafted" (decision 7). Status tip (`client.ts:353`) and guide `client.briefs.agency.md` follow; the agency approvals guides (`agency.approvals.agency.md:10,16`, `agency.approvals.detail.agency.md:33`) now say "Ready for review" too |
| Report status (`REPORT_STATUS`) | Guide `client.briefs.agency.md` and the status tip now list **Failed** alongside Preparing / Ready / Sent ("a report that could not be prepared shows Failed") |
| Brief rows (`briefs/page.tsx:58`) | Blue "Starting point" tag on starting-point briefs; "Week of Oct 19" on weekly ones |
| Alert time (`components/views/alert-view.tsx`) | Date, time and client zone label |
| Report empty state (`help/copy/client.ts:443`) | Title "No figures in this report"; body "This quarter had no data to report for {client}. The next report comes after the quarter ends." |
| Report dates and move status | Period and move dates short, move status in words |
| Pitch snapshot (`pitch-snapshot/page.tsx:41`) | "Generated Sep 1." in the client zone |

#### Evidence and Ask
| Where | Copy |
|---|---|
| Evidence page (`evidence/[evidenceId]/page.tsx`) | Captured with zone label; capture status chip (decision 5); kind in lower-case words: "This evidence is stored as raw {kind} and kept unchanged; it isn’t displayed here." |
| Composer line (`components/ask/ask-chat.tsx:253`) | Review off: "Only you can see your conversations." (new, always shown); review on: "Conversations may be reviewed by {product} to improve answers." |
| Empty thread list (`components/ask/thread-list.tsx:69`) | "Your questions appear here." |
| Privacy tip (`help/copy/client.ts:325`, Q6, approved, for the record) | Ends "Delete a conversation with the bin icon beside it and confirm. While conversations may be reviewed, the people named in that line can still read it." |

#### Setup
| Where | Copy |
|---|---|
| Step status (`setup/page.tsx`) | Chip: Not started / Running / Done / Skipped / Needs attention |
| Competitor pick (`setup/steps/pick-step.tsx:56`) | "{n} selected" (live) |
| Keyword field (`setup/steps/business-step.tsx:139`) | "Add your own (one per line, up to 5 in total)" |
| Billing step (`setup/steps/billing-step.tsx`) | Links to Agency settings > Billing for admins; turning billing on asks first (decision 10, new copy, needs approval) |

#### Settings
| Where | Copy |
|---|---|
| Alert rules (`settings/alerts/band-bar.tsx:10-18`) | Legend "Archived", "Weekly brief", "Instant alert" with ranges; aria-label "Scores 0 to {b-1}: archived. {b} to {a-1}: weekly brief. {a} to 100: instant alert." (numbers follow the fields). Page (`page.tsx:55`, agency view): "Instant alerts are still limited to 3 a day; extra ones go into the daily digest." Range sentence removed (decision 9) |
| Delivery (`settings/delivery/delivery-controls.tsx:16`) | "Alerts wait for the 17:00 digest (business time zone)." |
| Recipient roles (`settings/delivery/delivery-controls.tsx`) | The Delivery list and the add-recipient select now use the shared `MEMBERSHIP_ROLE` map ("Client owner" / "Client viewer") instead of "Owner" / "Viewer"; the map itself is unchanged |
| Deactivate (`delivery-controls.tsx:160-170`) | Confirm dialog "Deactivate {email}?", button "Deactivate"; Cancel does nothing |
| Save bars | Alert rules, Delivery, Profile ("Save profile"), Features ("Save features") show Save / Discard only after a change |
| Billing (`settings/billing/page.tsx`; guide `client.settings.billing.*.md:10`; tip `client.ts:658`) | Status is a chip; "Not available" means the agency has not shared billing details here; contact them |
| Usage, client and agency (`lib/spend-copy.ts:24`) | Quota 0: "4 used · Ask turned off by limit" (was "4 of 0" / "At quota") |
| Services area summary | Omits "0 ZIP codes" |

#### Heatmap (Reviews)
| Where | Copy |
|---|---|
| Table cell (`components/charts/topic-heatmap.tsx:30-35,119`) | "34% · Positive · ▲ 8 pts"; no sentiment "No sentiment"; no share "—"; points shown from 5 up |
| Tooltip (`topic-heatmap.tsx:72`) | "{business}, {topic}: 34% · Positive · ▲ 8 pts" (decision 8); a cell without a share adds " (not enough reviews)" |
| Phone | The chart keeps its width and scrolls sideways |
| Guides (`client.reviews.{agency,client}.md`) | The table sentence now describes the cell |
