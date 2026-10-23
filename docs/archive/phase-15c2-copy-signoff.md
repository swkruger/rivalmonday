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
