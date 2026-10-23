# 15b-3b copy sign-off

Owner: tick or edit each table, then answer "Decisions for the owner" at the end. Nothing here is applied until you sign (Task 6 applies it).

## Background

Two things change. First, the word "theme" becomes "topic" everywhere you, an agency or an AI assistant can see it: the platform page address (`/platform/themes` becomes `/platform/topics`), its help entries and the two review tools the assistant and MCP use. Second, approving a new topic now also checks reviews from the last 180 days for it, in the background, instead of only asking about reviews that arrive later. The text below is what says so. Where a row reads "unchanged", only an internal id or key is renamed.

## Short help copy (`apps/web/src/help/copy/platform.ts`)

| Where (file:key) | Current | Proposed |
|---|---|---|
| `platform.themes` -> `platform.topics` `.description` | New review topics found in reviews that didn’t fit any existing topic. Approved topics are asked for every review analysed from now on. | New review topics found in reviews that didn’t fit any existing topic. An approved topic is asked for every new review, and reviews from the last 180 days are checked for it too. |
| `platform.themes.decide` -> `platform.topics.decide` `.body` (title "Approving or rejecting" unchanged) | Approve a topic and it is asked for every review analysed from now on in that business type. Reject it and it is not proposed again. A decision cannot be undone from this page, and a proposal someone else already decided shows an error. | Approve a topic and it is asked for every new review in that business type, and reviews from the last 180 days are checked for it in the background. Reject it and it is not proposed again. A decision cannot be undone from this page, and a proposal someone else already decided shows an error. |
| `platform.themes.source` -> `platform.topics.source` | Where proposals come from: Each night, for every business type, reviews that matched no topic are collected. With at least 20 of them from the last 90 days since the last proposal, a model looks for one recurring topic that at least a fifth of them share, and proposes it. A business type has one open proposal at a time. "N reviews with no topic" is how many it looked at. | unchanged — id/key rename only |
| `platform.themes.decided` -> `platform.topics.decided` | Recently decided: The table lists proposals approved or rejected in the last 30 days, with the business type, the decision and the date. | unchanged — id/key rename only |
| `platform.themes` -> `platform.topics` `.empty.queue` | No proposals waiting: When enough reviews fit none of a business type's topics, a proposed new topic appears here for you to approve or reject. | unchanged — id/key rename only |

## Page header (`apps/web/src/app/(platform)/platform/themes/page.tsx` -> `topics/page.tsx`)

| Where | Current | Proposed |
|---|---|---|
| `metadata.title` | Topic proposals | unchanged |
| PageHeader `title` | Topic proposals | unchanged |
| PageHeader `breadcrumb` | Platform › Topic proposals | unchanged |
| Tip link labels (Where proposals come from / Approve or reject / Recent decisions) | same | unchanged — only the tip ids change |

## Operator guide (`docs/help/pages/platform.themes.operator.md` -> `platform.topics.operator.md`)

Sections not shown (What this page tells you, step 1 and 3, "Can I undo a decision?", "Why is the list empty?") are unchanged. Front matter `help_key: page:platform.themes` becomes `page:platform.topics`.

| Where (section) | Current | Proposed |
|---|---|---|
| How to use it, step 2 | 2. **Approve** to add it: it is asked for every review analysed from now on in that business type. **Reject** to turn it down: it is not proposed again. | 2. **Approve** to add it: it is asked for every new review in that business type, and reviews from the last **180 days** are checked for it too. **Reject** to turn it down: it is not proposed again. |
| Common questions, heading | ### Does approving re-read old reviews? | ### Does approving check older reviews? |
| Common questions, answer | No. Approved topics apply to reviews analysed from then on. | Yes, back to 180 days. After you approve a topic, reviews of that business type from the last 180 days are checked for it in the background, after any new reviews and at most 2,000 reviews a day across the platform. Older reviews are not checked. Until the check is done, the topic's numbers are based on fewer reviews. The same check runs when a business type's topics are edited, and when a competitor starts being tracked for another business type. |

## MCP / Ask tools (`packages/tools/src/tools/reputation.ts`, `nav-counts.ts`; `packages/ask/src/labels.ts`)

| Where (file:key) | Current | Proposed |
|---|---|---|
| `reputation.ts` `get_theme_benchmark` -> `get_topic_benchmark` `.description` | Review themes, your business vs each tracked competitor: how often each theme comes up and how positively, last 90 days vs the 90 before. | Review topics, your business vs each tracked competitor: how often each topic comes up and how positively, last 90 days vs the 90 before. |
| `reputation.ts` `search_reviews` `.description` | Search Google reviews of your business and tracked competitors by business, theme, stars or text. Reviewer identities are never returned. | Search Google reviews of your business and tracked competitors by business, topic, stars or text. Reviewer identities are never returned. |
| `reputation.ts` `search_reviews` error | Unknown theme | Unknown topic |
| `reputation.ts` `search_reviews` input `themeId` / output `themes` | themeId / themes | topicId / topics (field names, not shown text) |
| `nav-counts.ts` `get_platform_nav_counts` `.description` | Platform operators: badge counts for the platform menu — open model reviews and pending topic proposals. | unchanged (already says "topic proposals"); its error text also unchanged |
| `ask/labels.ts` `get_theme_benchmark` -> `get_topic_benchmark` | Comparing review topics… | unchanged text — key rename only |

## Decisions for the owner

1. Guide answer: is "Yes, back to 180 days." the right plain answer to "Does approving check older reviews?"
2. Is it fine to name the 2,000-reviews-a-day cap in an operator guide (operators may see internals)?
3. The last guide sentence (topic edits and new business types also trigger the check): keep, or drop as too much?
4. MCP tool descriptions above: approve the wording?
5. Client-facing Reviews copy stays unchanged (it never promised "new reviews only"). Agree?
6. MCP users: `get_theme_benchmark` and `themeId` simply disappear with no alias (decision D3). Announce this to anyone using them, or not?

**Sign-off:** Approved as a whole / with changes: ______________________, date: __________
