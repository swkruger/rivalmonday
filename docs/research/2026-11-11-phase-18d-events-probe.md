# Phase 18d coverage probe (2026-11-11)

Total spend **$0.03** (DataForSEO). Area: Austin / Dripping Springs, TX (`location_name: Austin,Texas,United States`).

## Already-collected data (staging, 2026-11-11)
- `ad`: 530 rows, **0** with `event` set (Meta event field never populated live).
- `gbp_post`: 313 posts / 20 businesses; loose event-word regex matches 5, **none** is a dated event.
- Event JSON-LD: web monitoring dark (`WEB_MONITORING_ENABLED` unset). ⇒ no usable live event source today.

## Google Events SERP (`serp/google/events/task_post`)
Rejected: `50304 This function temporarily unavailable` (no charge). Task-based only (no live endpoint). Not usable now.

## Google organic live advanced (`serp/google/organic/live/advanced`, depth 10, ≈ $0.002/call)
- **Venue-name query** (e.g. "Mohawk Austin") → `knowledge_graph` item with a `knowledge_graph_list_item` titled **"Events"**: up to **3** `knowledge_graph_list_element` rows `{title, subtitle: "Fri, Nov 13, 8:00 PM", url: google.com/goto?…}`. No year, no status (cancelled/sold out never shown), no price.
- Coverage: **6/9** venues (Mercer Street Dance Hall, Dripping Springs Distilling, Scoot Inn, Emo's, Mohawk; plus category query "live music Dripping Springs"). None for Treaty Oak Distilling, Vista Brewing, Camp Lucy (hotel panel).
- Area queries ("events in Austin", "concerts Austin"): only one `carousel` titled "Events" (concerts Austin) — mixed area events, not tied to a rival.

## Tripadvisor (`business_data/tripadvisor/search/task_post` → `task_get`, ≈ $0.00075/task)
Task-based (results in < 1 min here). **9/10** venues matched by name: `{title, rating.value, reviews_count, category}` (e.g. Treaty Oak Distilling 4.4 / 113, Pinballz Arcade 4.3 / 88, Mercer Street Dancehall 2.8 / 4). Miss: Emo's Austin. Camp Lucy categorised "Hotel".

## Follow-up checks (same day, ≈ $0.014)
- Panel list rows are in `knowledge_graph_list_item.items` (not `.data`).
- `location_coordinate` at the client centre (existing `serpSearch` path, e.g. `30.1902,-98.0867,10`) returns the same Events list as `location_name`; repeat runs return the same 3 events (stable).
- Tripadvisor search item fields: `type, rank_group, rank_absolute, title, url_path, is_sponsored, reviews_count, category, price_rate, rating{rating_type,value,votes_count,rating_max}`. No id/city fields: the location id is in `url_path` (`/Attraction_Review-g55765-d11750497-Reviews-…-Dripping_Springs_Texas.html` → `d11750497`, city slug at the end).

Total probe spend ≈ $0.05.

## Implications
- Live event source = weekly venue-name organic query per rival (+ self), knowledge-panel "Events" list. Lifecycle from this source = **announced only**; cancelled/sold out/postponed only from Event JSON-LD once web monitoring is on.
- Subtitle has no year: infer the next occurrence on/after capture date (in the client's time zone).
- Tripadvisor rating + review count are reliably available for venues/attractions.
