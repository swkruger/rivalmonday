---
help_key: page:client.changes
audience: agency
title: Changes
---
## What this page tells you

Every change detected for {{client}}'s tracked competitors, with its score (0 to 100), its route (Alert, Brief or Archived) and its evidence. The list is grouped by week; the right panel shows the selected change. Client users see the same page.

## How to use it

1. **Filter.** Search, or filter by competitor, change type, service or period (7, 30 or 90 days, or a year), then **Apply**.
2. **Choose a route.** **Alerts + brief** (the default) shows what reached the client. **All** adds archived changes; **Archived** shows only those. Check **Archived** when a client asks about something they did not hear about.
3. **Check the evidence.** **Side by side** shows the before and after screenshots, **Text changes** the changed words, and **Capture details** when each side was captured, its status and its file hash. When the same change was seen in several places, an **Evidence** button appears for each.
4. **Read the score.** Score = 100 × type × size × relevance × novelty, each from 0 to 1. Relevance is service overlap × area overlap; area only counts for service-area and new-location changes.
5. **Understand the routing.** Alert at or above the alert level, Brief at or above the brief level, Archived below both (defaults 70 and 40). A would-be alert goes to the brief when the change still needs a human check, or when it is older than the business type's alert age limit (7 days in every current business type). Tier changes are fixed: a promotion to Top rival is an alert, other promotions go to the brief, and demotions are archived.
6. **Give feedback.** **Useful**, **Not relevant** or **Wrong** is saved with the change.

## Common questions

### How do I change when something becomes an alert?

Under **Settings › Alert rules** for this client. New levels apply to changes detected from then on; changes already scored keep their route. How alerts reach the client (direct, after your check, or digest only) is under **Settings › Delivery**.

### Why did a high-scoring change not become an alert?

One of the caps applied (it needs a check, or it is too old), or the client already had 3 instant alerts that day; extra ones go into the daily digest.

### Do archived changes count anywhere?

They don't count toward competitive pressure or "Changes this week". They do count toward "Competitor price moves" on the Overview.

### What does "Part of moves" mean?

The change supports one or more moves (patterns over the last 90 days). Select a move to open it on the Moves page.
