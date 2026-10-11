# @cs/ui — working notes
Shared shadcn-based React components, theme tokens and styles for the web app.

## Gotchas
- **shadcn's `--accent` is the muted hover/focus surface, not brand amber:** `DropdownMenuItem`/`SelectItem`/outline-`Button` use `accent` for hover and focus, so mapping it to amber would turn every hover amber. `--color-accent` is the muted surface (`#EEF2F6`); brand amber has its own `--color-amber`/`--color-amber-text` tokens (wordmark, Friday badge, brief accents).
- Import branding constants from `@cs/email/branding`, never `@cs/email` (root pulls `node:fs`/`node:crypto` into the browser bundle).
