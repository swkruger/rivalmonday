# 15c-1 copy sign-off

Owner: tick or edit each table, then answer "Decisions for the owner" at the end. Source of truth: `apps/web/src/lib/labels.ts`. Tones: success, info, warning, danger, neutral. Maps marked **client** can render to client roles (scanned for agency-only words). Unlabelled values fall back to sentence case (neutral); empty shows "—".

## Labels (value -> label -> tone)

### BILLING_STATE
| Value | Label | Tone |
|---|---|---|
| pilot | Pilot | info |
| trialing | Free trial | info |
| active | Active | success |
| past_due | Payment overdue | warning |
| read_only | Read-only | danger |
| suspended | Suspended | danger |
| cancelled | Cancelled | danger |

### CLIENT_STATUS
| Value | Label | Tone |
|---|---|---|
| active | Active | success |
| prospect | Prospect | neutral |

### LEAD_STATUS
| Value | Label | Tone |
|---|---|---|
| unverified | Not verified yet | info |
| verified | Verified | info |
| accepted | Accepted | success |
| declined | Declined | danger |
| expired | Expired | neutral |

### ALERT_STATUS (client)
| Value | Label | Tone |
|---|---|---|
| drafting | Being drafted | info |
| pending_review | Waiting for review | warning |
| approved | Approved | success |
| delivered | Sent | success |
| dismissed | Dismissed | neutral |
| withdrawn | Withdrawn | neutral |
| expired | Expired | neutral |

### REVIEW_STATUS (vertical / business-area catalogue)
| Value | Label | Tone |
|---|---|---|
| reviewed | Reviewed | success |
| unreviewed | Needs review | warning |
| merged | Merged | neutral |

### REPORT_STATUS (client; trend and prospect reports)
| Value | Label | Tone |
|---|---|---|
| running | Preparing | info |
| ready | Ready | success |
| sent | Sent | success |
| failed | Failed | danger |

### ASK_MESSAGE_STATUS (client)
| Value | Label | Tone |
|---|---|---|
| ok | Answered | success |
| quota | Limit reached | warning |
| refused | Couldn't answer | danger |
| error | Something went wrong | danger |
| cancelled | Stopped | neutral |

### EVIDENCE_KIND (client)
| Value | Label | Tone |
|---|---|---|
| html | Saved page | neutral |
| text | Page text | neutral |
| screenshot | Screenshot | neutral |
| vendor_json | Source data | neutral |

### WEBHOOK_KIND
| Value | Label | Tone |
|---|---|---|
| slack | Slack | neutral |
| teams | Microsoft Teams | neutral |

### MEMBERSHIP_ROLE (client)
| Value | Label | Tone |
|---|---|---|
| agency_admin | Admin | neutral |
| account_manager | Account manager | neutral |
| client_owner | Client owner | neutral |
| client_viewer | Client viewer | neutral |

## Error and not-found pages
| Where | Copy |
|---|---|
| 404 tab title | Page not found |
| 404 heading / body | Page not found / This page doesn't exist or you don't have access to it. |
| Error tab title | Something went wrong |
| Error heading / body | Something went wrong / Please try again in a moment. |
| Buttons | Try again (error only); Go to your home page |
| Reference line (error, when a digest exists) | Reference: (digest) |

Neutral by design: no product name, wordmark or agency logo; the error message and stack are never shown.

## Dialog and save-bar defaults
| Component | String |
|---|---|
| ConfirmDialog | Cancel; "Type {x} to confirm" (label of the confirm-text field); the confirm button label is set per use |
| SaveBar | Save changes; Saving…; Discard; region label (screen readers) "Unsaved changes" |
| Loading | Loading… (screen-reader text in the page skeleton); "Loading the guide" on the help sheet (unchanged) |

## Distances (miles; km stays in storage)
| Where | String |
|---|---|
| Radius select (rank settings, profile, setup) | options "2 mi", "3 mi", "5 mi", "10 mi", "15 mi", "20 mi", "25 mi"; a stored value matching none shows first as "≈ N mi (custom)" |
| Field labels | Setup and profile: "Service area radius"; rank settings: "Radius" |
| Server error (radius out of range) | Radius must be between 2 and 25 miles. |
| Service-area summary (client profile, Area row) | "N miles around the business · N ZIP codes · towns" |
| Setup pick step | "N.N mi away" under 10 mi, "N mi away" from 10 mi |
| Competitor suggestions | "N.N mi" in the meta line |
| Rankings map line | "... · Grid 5×5 · 10 mi radius" (under 1 mi: one decimal) |
| Lead page neighbours table | column "Distance (mi)", values with one decimal |
| Intake preview fact (agency intake page, `packages/tools/src/intake/preview.ts`) | "The closest competitor is {name}, {x.x} mi away." |

## Dates and times
| Kind | Format | Example |
|---|---|---|
| Date, current year | Mon D | Oct 21 |
| Date, other year | Mon D, YYYY | Oct 21, 2025 |
| Date and time | Mon D, h:mm AM | Oct 21, 9:00 AM |
| Date and time with zone | plus generic zone (CT, ET, UTC) | Oct 21, 9:00 AM CT |
| Week | Week of Mon D (the Monday) | Week of Oct 20 |
| Relative | just now, N min ago, N h ago, yesterday, N days ago; future: in N min, tomorrow, in N days; 30 days or more: a date | just now; 5 min ago; 3 h ago; yesterday; 4 days ago; tomorrow |

On-screen change: long dates are now short (Nov 13 instead of November 13, 2026). Date-only values (billing periods) never shift with the viewer's zone.

## Decisions for the owner
1. REVIEW_STATUS uses the catalogue status because it is the only exported review enum. Labels: Reviewed / Needs review / Merged. OK?
2. Ask: refused = "Couldn't answer" (danger); cancelled = "Stopped" (neutral). OK, or should cancelled be a warning?
3. Evidence: html = "Saved page", vendor_json = "Source data" (client-facing). Better words?
4. Lead unverified = "Not verified yet" (info); verified = "Verified" (info, same tone). Should verified be success, or keep both info because neither is final?
5. Billing trialing = "Free trial"; past_due = "Payment overdue".
6. Alert delivered = "Sent"; report running = "Preparing".
7. Client prospect is neutral (not info).
8. MEMBERSHIP_ROLE is in the client-audience list (role names are not agency-only wording). Move it out?
9. Tone calls from review: dismissed alerts neutral (not warning); Ask cancelled neutral but billing cancelled danger (user choice vs lost access). Keep?
10. Error pages say nothing about the product; the home button goes to "/". OK?
11. The radius error says "Radius must be between 2 and 25 miles." but the server check is 2-40 km (2 km is about 1.2 mi), so the copy's floor is stricter than the check. Pick the wording: "between 1 and 25 miles", or keep.
