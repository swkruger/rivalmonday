# Phase 17c vendor brand-guideline ledger

Checked 2026-10-29 against each vendor's own pages only. Task 6 parses the table (`slug`, `verdict`, `approved`). A logo renders only when `verdict = logo-ok` AND `approved = yes` AND the file exists; otherwise the site shows a plain text wordmark. Nobody downloads logos except the owner.

| slug | verdict | approved | guideline URL (checked 2026-10-29) | permitted mark | conditions / don'ts | file to download | target path |
|---|---|---|---|---|---|---|---|
| openrouter | logo-ok | no | https://openrouter.ai/brand | Logo: horizontal, vertical or glyph, SVG | Page states only "don't stretch, recolor, or remix the marks"; no third-party use restriction or permission gate stated. Unaltered, no implied endorsement | Horizontal logo SVG, Ink variant (dark on light) | apps/site/public/logos/openrouter.svg |
| anthropic | text-only | no | https://www.anthropic.com/legal/trademark-guidelines | None without approval: marks only "as specifically permitted by us and only in materials we approve beforehand" | No alteration; no implied sponsorship/affiliation; revocable. "We use Claude" not addressed; ask marketing@anthropic.com for approval to flip | none | apps/site/public/logos/anthropic.svg |
| neon | logo-ok | no | https://neon.com/brand | Full-colour logo (default) or monochrome; logomark only where space is tight or in multi-brand symbol grids | Do not edit, distort, recolour or reconfigure; clear space = height of the Neon symbol; no implied endorsement. Page does not address "built with" use explicitly but publishes assets for third parties | Neon logo SVG, monochrome/black (or full colour) from the brand ZIP | apps/site/public/logos/neon.svg |
| vercel | text-only | no | https://vercel.com/geist/brands | Marks may state that you use a Vercel product ("Our website is hosted on the Vercel platform") | Trademark attribution statement in footer; unmodified, clear space = symbol height; not more prominent than our own marks. BUT the same page prohibits "commercial uses, such as ... marketing for your own products", which a marketing site arguably is; other uses need written permission (brand@vercel.com). Ambiguous, so text-only until the owner gets confirmation | (if cleared) Vercel logo SVG, black on light | apps/site/public/logos/vercel.svg |
| railway | unchecked | no | owner to check: no official brand page reachable (railway.com/brand and docs.railway.com/reference/brand returned 404; search found nothing official) | unknown | unknown | none | apps/site/public/logos/railway.svg |
| cloudflare | text-only | no | https://www.cloudflare.com/trademark/ | Word marks in text only. Logos prohibited without written permission; only the official "web badge" is allowed, solely to show a site is protected/accelerated by Cloudflare | Badge from Cloudflare press kit, unaltered; truthful; trademark attribution statement; no implied endorsement. A vendor-grid logo is not a web badge, so not covered | none | apps/site/public/logos/cloudflare.svg |
| postmark | unchecked | no | owner to check: postmarkapp.com/brand and the support brand article returned 404; no official guideline found | unknown | unknown | none | apps/site/public/logos/postmark.svg |
| stripe | text-only | no | https://stripe.com/newsroom/brand-assets ; terms https://stripe.com/marks/legal | "Powered by Stripe" badge and wordmark exist, but the Marks Usage Terms limit use to "the portion of your website ... that directly relates to our services" (checkout/Stripe-related pages); general pages such as a footer or integrations strip are not covered. Email trademarks@stripe.com before wider use | Not more prominent than our brand; unaltered; no new combined marks; no TM/R; wordmark slate/blurple on light, white on dark only; revocable | none (if cleared: wordmark SVG from the logo kit, slate on light) | apps/site/public/logos/stripe.svg |
| sentry | unchecked | no | owner to check: https://live.standards.site/sentry (brand guide; content did not load) and https://sentry.io/branding/ (download tool only, states no usage terms) | Wordmark or glyph SVG downloadable | Usage conditions not read | none | apps/site/public/logos/sentry.svg |

## Notes
- `drop` was not needed: no vendor forbids naming itself in plain text (nominative reference). Text wordmarks are used for every non-`logo-ok` row.
- Cloudflare covers R2 and Turnstile as one row.
- Where the guideline did not clearly permit a "we use X" strip, the verdict is conservative (`text-only` or `unchecked`), never guessed.

## Owner section
For each row with `verdict = logo-ok` (currently openrouter, neon):
1. Download the named file from the vendor's official press kit (URL in the table). Do not recolour, crop or edit it; respect clear space.
2. Save it at the target path under `apps/site/public/logos/`.
3. Flip that row's `approved` to `yes`, commit the SVG and this file.

To upgrade other vendors: get written confirmation (Anthropic marketing@anthropic.com, Vercel brand@vercel.com, Stripe trademarks@stripe.com, Cloudflare per its trademark page), or read the missing guidelines (Railway, Postmark, Sentry), then change the `verdict`, mirror it into `INTEGRATIONS[].brand`, and follow the same steps. Add the vendors' trademark attribution statement in the site footer for any vendor whose logo is shown.
