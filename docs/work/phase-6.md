# phase-6 - Remote MCP server (6a), Ask assistant "Friday" (6b), knowledge base (6c)

**Kind:** feature   **Worktree:** ../CompetitorSpy-wt/phase-6   **Base:** main @ 1c4a7fd (main merged in @ ebeb2ee)
**Spec/plan:** 6a `docs/superpowers/{specs,plans}/2026-10-11-phase-6a-mcp*.md` (d1-d13, P1-P18); 6b `…/2026-10-12-phase-6b-ask*.md` (e1-e11, Q1-Q13); 6c `…/2026-10-12-phase-6c-knowledge*.md` (k1-k11, S1-S11)

## Status (overwrite)
**6a + 6b + 6c done** (2026-10-12). 6c = Tasks 0-12 + final review (opus) + one fix wave, head `ec593f3`. Last runs: affected unit `--base main` 14/15 packages green, the one failure (`@cs/demo` coverage) fixed in `ec593f3` (coverage 60/60), affected unit not re-run in full after the fix wave; `e2e:affected --base main` 41/41 incl. 4 `@kb`. Migrations 0038-0046 not applied to `cs_dev`. Nothing uncommitted.

## Next (overwrite)
1. Owner go-ahead → one `/rm-merge phase-6` (full unit + full E2E, `pnpm db:migrate` + `pnpm kb:seed` on `cs_dev`), then owner verification below.
2. Undecided copy: MCP "Token revoked." / "App disconnected.".

## Interfaces this branch adds or changes
**Migrations (next free: `0047`):** `0038_mcp`/`0039_mcp_rls` (`api_token`, `oauth_grant_binding`, `mcp_rate_window`, `audit_log.channel`/`token_id`, `recommendation.source` `'mcp'`, SQL-only `search_tsv`+GIN); `0040_feedback_kind_created`; `0041_auth_oauth` (7 `auth."oauth*"` tables); `0042_ask`/`0043_ask_rls`/`0044_ask_quota_used` (`ask_thread`, `ask_message`, `ask_starter`, `client.ask_monthly_quota`/`ask_review_allowed`, author-only RLS, SECURITY DEFINER count fn); **`0045_kb`/`0046_kb_rls`** (`kb_article`, `kb_chunk` with copied scope + `client_visible`, `embedding vector(512)`, SQL-only `search_tsv`; app_user SELECT-only RLS; chunks exist only for published articles). `withTenant` sets `app.user_id`/`app.role`.
**Env:** `ASK_FAKE_AI` (E2E only; throws in production); **`KB_IMPORT_ENABLED`** (`'true'` enables URL import/sync; turbo passthrough + `E2E_SERVER_ENV` `''`). Owner adds it to `.env` when wanted.
**`@cs/core`:** `tokens.ts`, registry `channels`/`audit`/`mcpScope`, `CallMeta`, hidden = `not_found`; **`kb.ts`** (`KB_LEVELS`, `KB_KINDS`, `renderKbText`, `lintKbText`, `chunkMarkdown`); `AppTarget` `{t:'kb'}` → `/kb/<id>`.
**`@cs/mcp`:** `resolveBearer`, `createMcpServer`, `handleMcpRequest`, `checkRateLimit`, `productNameFor`; resources, 4 prompts; SDK 1.30.1.
**`@cs/ai`:** `chatWithTools`; tasks `ask_assistant`, `ask_starters`, `ask_guard_decisions`.
**`@cs/ask`:** `beginTurn`, `runTurn`, grounding, starters, quota; `CITATION_PREFIXES = ['ev','kb']`; `search_knowledge` `clientId` pinned to the thread; uncited sentences ground against `ev:` text only (k9).
**`@cs/tools`:** MCP `search` (types incl. `knowledge`, MCP only; excluded on `ask`), `fetch` (`knowledge:<id>`, refused on `ask`), `add_recommendation`, token/grant tools; Ask web tools + `get_usage.questions` etc. **6c:** `search_knowledge` (web/mcp/ask), `get_kb_article` (web), `searchKnowledgeHits(…, opts.queryVector)`; operator tools `list_kb_articles` (`lastSyncChanged`), `get_kb_article_admin`, `upsert_kb_article`, `delete_kb_article`, `set_kb_auto_sync`, `import_kb_url`, `get_kb_import_status`, `list_kb_targets`; `saveArticle`/`rechunk`, `seedKnowledge`, `blocksToMarkdown`, `isPublicHttpUrl`/`isPublicAddress`, `kbNamesFor`. `QueueJob` + `'kb-embed'|'kb-import'`; `JobStatusLookup` returns `output`.
**Worker:** `ask-starters`; **`kb-embed`** (`{articleId?}`, hourly sweep `15 * * * *`), **`kb-import`**, **`kb-sync`** (`0 5 * * 0`); `JobDefinition.handler` may return an object → pg-boss `output`; `@cs/worker` depends on `@cs/tools`; CLI `kb-seed` (root `pnpm kb:seed`).
**Web:** `POST /mcp`, `/.well-known/oauth-*`, `/oauth/consent`, `/agency/ai`, `/c/<id>/settings/ai`; 6b `POST /api/ask/turn`, `/c/[clientId]/ask[/threadId]`, `/platform/ask[/threadId]`; **6c** `/kb/[id]`, `/platform/knowledge[/new|/[id]]` (nav "Knowledge", operators), `kb:` chips + article sheet, `react-markdown@10.1.0`. E2E tags `@ai-connections`, `@ask`, `@kb`. Demo seed `seedKb` (`DemoIds.kbArticleId`); `demo:reset` runs `seedKnowledge`; `/rm-merge` skill runs `pnpm kb:seed` after migrating `cs_dev`.
**Docs:** `docs/help/*.md` = platform help articles (seed source; `{{product}}`/`{{assistant}}` placeholders only).

## Assumes from other branches
None. `phase-7-planning` (parked) and the 8a/8b/9 plans on `main` assume our `api_token`/OAuth/Ask tables and `requirePlatformOperator(deps, ctx)` (8a extends it with `min?`); they take the next free migration (now `0047`).

## Decisions (owner-approved)
Spec d1-d13, e1-e11, k1-k11 and plans P1-P18, Q1-Q13, S1-S11 are binding. Owner: one merge for all of Phase 6; consent lead line "After you allow, you'll be sent to **{host}**."; Ask model sonnet-5; `ASK_FAKE_AI`. 6c: knowledge = one store, 3 levels, operator-only authoring; agency `client_visible` default on; URL import with per-article auto-sync (changes applied, not queued); own flag `KB_IMPORT_ENABLED`; `{{product}}`/`{{assistant}}` placeholders; retrieval via tool; surfaces = Friday + MCP.
6c implementation rulings (SDD): merge main instead of rebase; RLS tests in `packages/db/src/kb-rls.test.ts`; 0045 generated from Drizzle + hand-appended tsv; job output via pg-boss `output`; kb-embed cost at platform scope; chip label "Article"; nav "Knowledge"; inline delete confirm; `?lint=` param for first-save warnings; DNS-rebinding race accepted (operator-only, flag off).

## New backlog (target -> item)
- Later: REST API (§8.1). Phase 7: tier gating of `mcp`/`ask`; MCP `manage` for client roles; ANN vector index (incl. `kb_chunk`); brief writers -> sonnet-5.
- Phase 7 (security): **renderer-level SSRF guard** (Playwright `page.route` resolved-IP check or pinned resolver; covers kb import/sync, competitor URLs, robots fetch, `www.`/port redirects); SIIT `::ffff:0:0/96` as non-public.
- MCP hardening/tests (6a): vector-only pages, unredacted model titles, uncapped `fetch` brief text, connector name not white-labelled, screenshot mime; upsell offset-0, `add_recommendation` not one tx, `revoke_oauth_grant` partial failure, consent race, `clientScope[0]`; tests for cross-agency, P18, review cross-client, `/sign-in` OAuth, exact client `tools/list`.
- Ask (6b): composite FK widen; confirm allowlist; unknown clientId FK 23503; starters skipped on notify throw; `dataBlock tool=` unescaped; per-call model budget; trace quoting; review toggle atomicity; lookalike markers; 400 vs 404 order; delete precheck; SSE action echo; pre-persist error edge cases; `?q=` auto-send; no Origin check; agency users steer evidence pool to another client via generic `search`/`fetch` (pre-6c; knowledge part fixed); 0044 BYPASSRLS reliance; grounding splitter edge cases; UI polish (one-click delete, duplicate saves, "N of 0"); missing tests (RLS WITH CHECK, components, chip auto-send).
- Polish (6c): uncited filler sentences in pure how-to answers checked against empty `ev:` text (watch traces); `kbNamesFor` 3rd copy of names logic (invert into `@cs/tools`); kb hits pass `names: []` to redaction; `if (v)` skip in kb-embed should throw; scope not validated before `kb-import` enqueue; kb-sync 7200 s expiry vs many articles; archived import jobs read as failed; seed guard only in tools (move into `saveArticle`); `previous_body_md` set on manual edits; `get_kb_article` skips active-client check; `sourceUrl` not http(s)-restricted; operator UI (`start()` throw, stale preview kind, alertdialog focus, "Saved." after publish); chunker edge cases (`C#`, long heading paths, fences, CRLF); test gaps (GIN guard title, CHECK tests, unset role, mcp title redaction, embed mapping, brittle `@kb` selectors).
- Later: file upload to KB; browsable Help page; agency/client self-authoring (`manage_knowledge`); KB in weekly briefs; citation analytics.

## Owner verification steps
1. After merge: `pnpm db:migrate` + `pnpm kb:seed` on `cs_dev`. Review `docs/help/*.md` copy; confirm the unverified claims (past-conversation list/delete, admins see all tokens, Claude Code command).
2. MCP: token at `/agency/ai`; `claude mcp add --transport http rival-monday http://localhost:3000/mcp --header "Authorization: Bearer rm_pat_..."`; ask about a competitor, check evidence ids; ask "How do I connect an AI app?" (agency product name); revoke, confirm failure. If live: Claude.ai connector, consent page shows redirect host.
3. Ask: cited answer + evidence chip; save recommendation; confirm a write; client user at quota sees exact copy; `/platform/ask`.
4. Knowledge: `/platform/knowledge` → agency playbook with "Visible to client users" off + a client fact; ask as agency user (both cited) and client user (fact only); `kb` chip opens the sheet.
5. With `KB_IMPORT_ENABLED=true`: import a public Q&A page, review draft, publish, enable auto-sync.
6. Decide MCP revoke success copy.

## ARCHITECTURE notes for `/rm-merge`
Add `@cs/mcp` (bearer, stateless server, resources, prompts, rate limit), registry channels/scopes/audit, consent flow; `@cs/ask` (verify-then-send turns, quota, actions, starters, `kb:` citations) and the Ask web surface; knowledge base (`kb_article`/`kb_chunk`, operator authoring at `/platform/knowledge`, hybrid FTS+vector `search_knowledge`, worker `kb-embed`/`kb-import`/`kb-sync` behind `KB_IMPORT_ENABLED` + SSRF guard, repo seed `docs/help`, sheet + `/kb/<id>`, MCP `knowledge` type). STATE: next migration `0047`; move Phase 6 BACKLOG items done here out, file the items above.
