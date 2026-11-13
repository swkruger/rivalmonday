# Phase 18e social coverage probe (2026-11-13)

ScrapeCreators, **58 credits** total (1 credit per call, cache hits 0). 20 tracked rivals from staging (HVAC/plumbing, dental, distilleries, one venue). Script and raw output in the session scratchpad (not committed).

## Endpoints used (all `GET https://api.scrapecreators.com`, header `x-api-key`)
| Call | Path | Gives |
|---|---|---|
| Find page | `/v1/facebook/adLibrary/search/companies?query=<name>` | `searchResults[]`: `page_id`, `name`, `page_alias`, `ig_username`, `likes`, `ig_followers`, `category`, `page_is_deleted` |
| FB profile | `/v1/facebook/profile?url=<page url>` | `followerCount`, `likeCount`, `talkingAboutCount`, `website`, `category`, `links[]`, `rating`; optional `include_gated_profile=true`, `cache_max_age` |
| FB posts | `/v1/facebook/profile/posts?pageId=<id>` | 3 posts per call (`cursor` for more): `id`, `text`, `url`, `publishTime`, `reactionCount`, `commentCount`, `videoDetails` |
| IG profile | `/v1/instagram/profile?handle=<h>&trim=true` | followers, post count, `external_url`, `is_business_account`, **12 recent posts** with `taken_at_timestamp` and caption |

## Coverage
- **Find page:** a candidate for **18/20** (misses: Fischer AC & Heating, Stable Plumbing). Name search alone is unsafe: 4 candidates were a same-name business elsewhere (Comfort Masters → Lubbock, Atomic Plumbing → Virginia Beach, Serenity Dental → Kansas City, Lakeview Dental → other domain).
- **Confirmation by website:** FB `website` or IG `external_url` host = the rival's domain for **10/20** (Aire Serv, Archstone, Austin Dental Specialty, Family Dentistry on Manchaca, Glow Dental, Granbury Dental Center, Granbury Park, EF Plumbing, Mohawk, + Crowded Barrel on a sibling domain). Linktree / scheduling links (2) don't confirm.
- **Staging data issue:** Serenity Dental (Austin) already has Meta page `1185832798245526` stored from ad-account matching; that page is Serenity Dental **Kansas City**. Meta ad matching has the same wrong-business risk.
- **FB profile:** 15/18 returned; **alcohol brands (Deep Eddy, Treaty Oak, Dripping Springs Distilling) return "Profile is private"** (age-gated; `include_gated_profile=true` not tried) and their IG returns 403/404.
- **Instagram:** handle from the search for 13/18; 9 profiles read; 12 recent posts each with captions (120/120).

## Signals
- Follower counts small-business sized: FB 119–2,389 (local services), 8,979–52,190 (distillery/venue); IG 26–11,073.
- **Cadence:** active rivals post weekly to daily (Aire Serv daily, Atomic/Glow/Serenity several a week); dormant ones last posted 2025 (EF Plumbing, Austin Dental Specialty) — "went quiet / started posting" is a real signal.
- **Promos:** 5/42 FB posts and 19/120 IG captions read as offers ("save up to $1,000", "Invisalign Day on October 30th"); venues post dated events ("Tonight, outdoor: … Doors …") → feeds 18d `listed_event`.
- 3 posts per FB call: a daily poster needs ~3 calls/week to see every post; IG gives 12 per call.

## Implications
- Handle discovery = one search per rival, **auto-accepted only when the page's website (or IG external url) matches the rival's domain**; otherwise a suggestion for the agency to confirm. Self the same.
- Weekly per rival: FB profile (1) + FB posts (1–3) + IG profile (1) ≈ 3–5 credits; 10 rivals + self ≈ 40–55 credits/client/week.
- Age-gated (alcohol) pages need `include_gated_profile=true` (limited fields) — expect follower counts only.
