# Phase 8c: vendor balance / usage APIs (researched 2026-10-13)

"live" = called with the repo keys on 2026-10-13 (read-only). "docs" = vendor documentation only.

## 1. OpenRouter (prepaid balance + per-key usage)
- `GET https://openrouter.ai/api/v1/credits`, header `Authorization: Bearer $OPENROUTER_API_KEY`. A normal key works, no provisioning/management key (live: HTTP 200). Response `{data:{total_credits:20, total_usage:3.91}}`, USD. Balance = `total_credits - total_usage`. Account-wide lifetime totals.
- `GET /api/v1/key` (same auth, live 200): `data.limit` (50), `limit_remaining`, `limit_reset` ("monthly"), `usage`, `usage_daily`, `usage_weekly`, `usage_monthly` (USD, this key only), `byok_usage*`, `is_free_tier`, `budgets[]`/`effective_budget` {limit_usd, spend_usd, remaining_usd, resets_at}. Also returns `label` and `creator_user_id`: don't log the body raw.
- Gotcha: the key's monthly cap (`limit` 50) is not the prepaid balance; `/credits` is the top-up number (20 total, 16.09 left at probe time). `/credits` is account-wide, `/key` only that key's spend.
- Top-up: https://openrouter.ai/settings/credits . Rate limits: none documented for these reads.

## 2. DataForSEO (prepaid balance)
- `GET https://api.dataforseo.com/v3/appendix/user_data`, HTTP Basic `DATAFORSEO_LOGIN:DATAFORSEO_PASSWORD`. Free, not billed (live 200, envelope `20000`, `tasks[0].status_code` 20000).
- Key fields in `tasks[0].result[0]`: `money.balance` (USD float, 49.67 live), `money.total` (USD deposited to date, 51), `money.limits` (per-day/minute call limits and usage counters, large), `timezone` ("America/Chicago"), `login`, `rates`, `price`. Do not store/log the whole body (it is about 36 KB of limits and rates).
- Sandbox: `https://sandbox.dataforseo.com/v3/appendix/user_data` also answers 200 (live) with the same credentials, but its balance is not the real balance. Always read production. Check the task-level `status_code`, not just HTTP: the repo saw account pauses as 200 + task `40201` (see phase-2 vendor doc).
- Rate limit: 2,000 calls/min (same as the rest of the API). Top-up: https://app.dataforseo.com/billing (Billing / Add funds).

## 3. Apify (monthly spend vs plan cap; no prepaid balance)
- `GET https://api.apify.com/v2/users/me/limits`, header `Authorization: Bearer $APIFY_TOKEN` (live 200). `data.monthlyUsageCycle{startAt,endAt}` (UTC calendar month), `data.limits.maxMonthlyUsageUsd` (5 live, the plan's USD cap), `data.current.monthlyUsageUsd` (0.049 live), plus compute units, proxy and transfer counters. Best single call: spend and cap together.
- `GET /v2/users/me/usage/monthly` (live 200): `data.usageCycle`, `totalUsageCreditsUsdBeforeVolumeDiscount` and `...AfterVolumeDiscount` (USD), `monthlyServiceUsage{<METER>:{quantity,baseUnitPriceUsd,amountAfterVolumeDiscountUsd}}` and `dailyServiceUsages[]` for per-day breakdown. Optional `?date=YYYY-MM-DD` selects another cycle (docs).
- Gotcha: this account's cap is $5 (free plan); credits reset at cycle start, so "remaining" = `maxMonthlyUsageUsd - monthlyUsageUsd`. No rate limit documented (global 30 req/s per resource). Billing: https://console.apify.com/billing .

## 4. ScrapeCreators (prepaid credits)
- Yes: `GET https://api.scrapecreators.com/v1/credit-balance`, header `x-api-key: $SCRAPECREATORS_API_KEY`. Live 200: `{"success":true,"creditCount":7099,"message":"You have 7099 credits remaining."}`. Unit: credits, not USD (each page/request costs about 1 credit). Does it cost a credit? Counter unchanged (7099) vs the 2026-10-01 probe, so it appears free. Every normal call also returns `credits_remaining`, so the figure can be piggybacked.
- Rate limits: none documented. Top-up: https://app.scrapecreators.com (dashboard billing). I did not find an official doc page for the endpoint; verified by live call only.

## 5. Anthropic Admin API (month-to-date spend; no balance endpoint)
- `GET https://api.anthropic.com/v1/organizations/cost_report`, headers `x-api-key: sk-ant-admin01-...` and `anthropic-version: 2023-06-01` (docs).
- Params: `starting_at` (RFC 3339, required), `ending_at`, `bucket_width` (only `1d`), `group_by[]` (`description`, `workspace_id`), `limit` (1-31, default 7 buckets), `page` (token from `next_page`).
- Response: `data[]` of buckets `{starting_at, ending_at, results[]}`, `has_more`, `next_page`. Empty days appear with `results: []`. Each result: `amount` is a **decimal string in cents** (`"123.45"` = $1.23), `currency` "USD", and when grouped by description `description`, `model`, `cost_type` (tokens, web_search, code_execution, session_usage), `service_tier`, `token_type`, `workspace_id` (null = default workspace). MTD = sum of amount / 100 over buckets from the 1st (fits in one page of 31).
- Gotchas: daily buckets only (UTC); Priority Tier costs are excluded (use the usage_report endpoint); data lags by about 5 min; polling up to 1/min is fine. Admin keys need an organization (not an individual account); workspace-scoped keys do not work. **No prepaid-credit-balance endpoint exists**; balance is only in the Console (the phase-2 doc records a "credit balance too low" 400 on batch).
- Console: https://platform.claude.com/settings/billing (balance / top-up), https://platform.claude.com/cost (cost page).

## 6. Neon (usage units, not dollars)
- Neon bills by plan; no balance/dollar endpoint. Two consumption endpoints, `Authorization: Bearer $NEON_API_KEY` (docs):
  - Current usage-based plans (Launch, Scale, Agent, Business, Enterprise; other plans 403): `GET https://console.neon.tech/api/v2/consumption_history/v2/projects?from&to&granularity=hourly|daily|monthly&org_id=<required>&metrics=<required, repeat or comma>&project_ids&limit(1-100)&cursor`. Metrics: `compute_unit_seconds`, `root_branch_bytes_month`, `child_branch_bytes_month`, `instant_restore_bytes_month`, `public_network_transfer_bytes`, `private_network_transfer_bytes`, `extra_branches_month`, `snapshot_storage_bytes_month`. Window limits: hourly 168 h, daily 60 d, monthly 1 y (else 406). History starts at upgrade to an eligible plan.
  - Legacy plans (Scale/Business/Enterprise legacy): `GET /api/v2/consumption_history/projects` (`org_id` optional) with metrics `active_time_seconds`, `compute_time_seconds`, `written_data_bytes`, `logical_size_bytes`, `logical_size_bytes_hour`.
- Units: seconds, bytes, byte-months, counts. Convert to dollars with Neon's price sheet ourselves. Response nests `projects[].periods[].consumption[]` (`period_plan`, `timeframe_start/end`, metric values) with `pagination.cursor`.
- Gotchas: the v2 doc's response example uses the legacy field names (docs inconsistency), so verify field names with a live call before typing the schema. Does not wake computes. 429 on excess, no numeric limit documented. Free-plan accounts get 403, so handle it as "not available". Console: https://console.neon.tech/app/billing (org billing).
