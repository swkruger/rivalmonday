---
help_key: page:client.settings.alerts
audience: agency
title: Alert rules
---
## What this page tells you

The two scores that decide what happens to a competitor change for {{client}}. Every change gets a score from 0 to 100 for how much it matters to the client. Then:

- **At or above the instant alert level**, it becomes an instant alert.
- **From the weekly brief level up to the alert level**, it goes in the weekly brief.
- **Below the brief level**, it is archived. It is still listed on the Changes page.

The page states the client's current levels in plain words. If they are not the defaults, **Use the defaults** puts them back. New levels apply to changes detected from now on; changes already scored keep their place.

## How to use it

1. **Set the two levels.** Both are whole numbers: *Weekly brief from score* 1 to 99, *Instant alert from score* 2 to 100, and the brief level must be lower than the alert level.
2. **Save**, and check the Changes page after a few days to see where new changes fall. The score bars there show the same two lines.
3. **Remember the daily limit.** Even a high score may not send at once: a client gets at most 3 instant alerts a day, counted on the business's local day. Extra alerts wait for the evening digest, sent from 17:00 business time.
4. **Use Delivery for how alerts are released.** Direct, I review alerts first and Digest only are set on the Delivery tab, not here.

If you cannot edit the levels, you lack the manage permission, or the session is read-only; the page then just states them. The same two levels are also a setting in the client's runbook; saving them here updates that setting too.

## Common questions

### Why did a big change not send an alert?

Either its score is below the alert level, the client already had 3 instant alerts that day, or the client's alert mode is *I review alerts first* or *Digest only*. Check the change's score and the Delivery tab.

### What do I lose by raising the alert level?

Fewer instant alerts and more changes in the weekly brief. Nothing is lost: every change stays on the Changes page with its evidence.

### Can the client change these levels?

Only when the *Alert rules* client feature is on, and only for people allowed to manage the client. Everyone else sees the levels and is told to ask the agency.

### What are the defaults?

The page shows them on the **Use the defaults** button as alert/brief, for example (70/40). They can differ between agencies and verticals, so read the button.
