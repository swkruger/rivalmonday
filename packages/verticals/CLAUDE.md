# @cs/verticals

- **Packs are seed + fixtures only.** `packs/*.yaml` seed the DB catalogue (`vertical`, `business_area`, `vertical_category`, migration 0077) and feed tests. The runtime reads the DB catalogue through `createCatalog` / `catalogOf(deps)`; never load YAML in production paths.
- Regenerate seed SQL with `pnpm --filter @cs/verticals seed-sql`.
- A changed YAML needs a **new** migration carrying the changes. Never edit 0077 or any applied migration.
- `generic` supplies the numeric knobs (type weights, move thresholds, scoring). Deep merge: objects are merged, arrays are replaced.
- Assembled packs list services sorted by name (the DB has no order column), so the YAML order is not preserved.
- `generic` is never user-selectable and cannot be merged.
- Draft quotes are checked with `normaliseQuote` (NFKC, curly quotes, whitespace, lower case); reuse it, don't write another normaliser.
