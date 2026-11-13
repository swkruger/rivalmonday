# @cs/verticals

- **Packs are seed + fixtures only.** `packs/*.yaml` seed the DB catalogue (`vertical`, `business_area`, `vertical_category`, migration 0077) and feed tests. The runtime reads the DB catalogue through `createCatalog` / `catalogOf(deps)`; never load YAML in production paths.
- Regenerate seed SQL with `pnpm --filter @cs/verticals seed-sql`.
- A changed YAML needs a **new** migration carrying the changes. Never edit 0077 or any applied migration.
- `generic` supplies the numeric knobs (type weights, move thresholds, scoring). Deep merge: objects are merged, arrays are replaced.
- Assembled packs list services sorted by name (the DB has no order column), so the YAML order is not preserved.
- `generic` is never user-selectable and cannot be merged.
- Draft quotes are checked with `normaliseQuote` (NFKC, curly quotes, whitespace, lower case); reuse it, don't write another normaliser.
- **Citations (18c-1):** the directory groups (`general`, `home_services`, `dental_health`) live in `generic.yaml` only; a vertical picks `citations.groups`. `citationCatalogue(pack)` returns `[]` when the pack has no `directory_groups` (a YAML-only non-generic pack not merged with generic), so its clients are never audited. Catalogue = union of picked groups, first host wins, at most 15. `BANNED_CITATION_HOSTS` in a pack is a schema error. `min_missing` is read from the `citation_gap` rule params, not from `citations`.
- **Venues pack (18d):** vertical flags `events` (panel) and `tripadvisor` opt a pack in. The pack lists its plays in full because `deepMerge` replaces arrays; it claims categories incl. bar/brewery/distillery/winery (related), so agencies cannot create those as their own verticals.
