---
help_key: page:client.evidence.detail
audience: all
title: Evidence
---
## What this page tells you

The stored proof behind a point in a brief, an alert or an answer: what was captured, from where, when, and a fingerprint that shows it has not been changed since.

- **The preview** shows a snapshot of the page when the evidence is a screenshot, or a link to the captured text. Raw page code and provider data are kept unchanged and are not displayed, but their fingerprint is shown.
- **Source** says where it came from. A competitor's own website is captured automatically by our monitoring service; other sources, such as Google profiles and ad libraries, are recorded when their data is collected.
- **Captured and Status** give the date and time in UTC and whether the capture worked. "ok" means the page or data was read normally.
- **The fingerprint (SHA-256)** is a long code worked out from the captured content. The same content always gives the same code, and changing even one character gives a completely different one. Working the code out again from the stored file and getting the same result shows it has not been altered since it was captured.
- **Kept** says how long the evidence is stored.
- **Part of these changes** lists the changes that cite this evidence, when you have access to the Changes page.

## How to use it

1. **Look at the preview and the date.** Make sure it shows what the brief or alert says it does.
2. **Open the URL** shown under Capture details to compare with the live page. It may have changed since.
3. **Follow Part of these changes** to see how this evidence was scored.
4. **Ask a question about it.** If you see an **Ask {{assistant}} about this** button, it opens a question grounded on this evidence, and **Add recommendation** saves a next step with it attached.

## Common questions

### What is a SHA-256 hash?

It is the fingerprint described above, a 64-character code. It identifies the content without revealing it.

### Why can I not see the page itself?

Raw page code and provider data are never displayed. A screenshot or captured text is shown when there is one.

### How long is evidence kept?

Under the retention policy, and for as long as a delivered brief cites it. Evidence on legal hold is never deleted.

### Why does the date look different from my time zone?

Capture times are shown in UTC.
