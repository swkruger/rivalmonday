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
