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
