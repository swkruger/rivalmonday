# 15c-2 copy sign-off

Owner: tick or edit each item. Source of truth is the code named per item.

## 15c-2a

### Platform > Agencies (T3)
| Where | Copy |
|---|---|
| Search label | Search agencies |
| Search button / clear link | Search / Clear |
| No match | No agencies match "{q}". |
| Created / last activity | "Oct 21" in the current year, "Oct 21, 2025" otherwise; last activity relative ("yesterday", "4 days ago") then a date; in the viewer's time zone |
| Previous / Next | ‹ Previous / Next › |

### AGENCY_HEALTH (`apps/web/src/lib/labels.ts`)
| Value | Label | Tone |
|---|---|---|
| at_risk | At risk | danger |
| idle | Idle | warning |
| growing | Growing | success |
| steady | Steady | info |

The Billing column now uses BILLING_STATE labels (Free trial, Payment overdue, Read-only, ...) instead of the old platform pill words (Trial, Past due, Paused).

### Platform > Lead pool and Model reviews (T4)
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

### Platform > Billing & plans (T5)
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

### Platform > other pages sweep (T6)
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

### Agency > Alert review (T7)
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

### Agency > Portfolio, Approvals, Prospects, Leads (T8)
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

### Agency settings and onboarding (T9)
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

### Agency settings > Slack & Teams (T10)
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
