# 15c-2 copy sign-off

Owner: tick or edit each item. Source of truth is the code named per item.

## 15c-2a

Page groups below: Platform, Agency, Account and public. Task numbers (T3-T16) point to the plan. Source of truth is the code; each table names the page it lives on.

### Owner decisions (open copy and policy questions)
Tick, or reply with the change.
1. **Privacy URL (B12).** Sign-up and platform /start link to `https://rivalmonday.app/privacy`. Confirm the URL (the page must exist before launch). Agencies have no privacy URL of their own yet (backlog).
2. **"as Agency admin" grammar.** The invite email reads "invited you to join {agency} as Agency admin" / "as Account manager". Keep, or switch to "as an Agency admin"?
3. **Branding contrast line.** "Buttons will use dark text so they stay readable." now also shows for the default blue #47A8E7 (ink label on primary, design system v1). Proposal: drop the line.
4. **"Waiting …" age wording** on alert review ("Waiting 3 days", "yesterday", "5 h"). Edge cases (just now, older dates, alerts held for the digest) are not yet worded. OK as is?
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
| Ask thread | Speaker: Client / Friday (the default assistant name) / Tool; status chip from ASK_MESSAGE_STATUS (Answered, Limit reached, Couldn't answer, Something went wrong, Stopped); message time in the viewer's zone; "Action" and "Trace" JSON now inside a closed "Technical details" toggle; tip "Citations and technical details" reworded |
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
| Cap notice (only when 200 rows are shown) | Showing the oldest 200 — filter by client to see more |
| Age on each alert | Waiting {3 days / yesterday / 5 h} |
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
