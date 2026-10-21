---
help_key: page:platform.knowledge
audience: operator
title: Knowledge
---
## What this page tells you

Articles the Ask assistant can search and cite, at three levels: **Help (platform)** for everyone, **Agency** for one agency, **Client** for one client. Each article has a kind: help article, playbook, Q&A, blog post or fact.

Badges on each row:

- **Draft** or **Published**. Only Published articles can be found and cited by the assistant.
- **Manual**, **URL** or **Managed in repo**. Managed in repo articles are the page guides and glossary terms seeded from the repository by `kb:seed`. They are read-only here.
- For URL articles, the last sync and whether the text changed, or the reason a sync failed.

## How to use it

1. **Filter** by level, agency, client, kind or status, or search titles.
2. **Click New article** to write one, or open a row to edit it.
3. **To change a Managed in repo article**, edit its Markdown in the repo and seed again.
4. **URL import** (when it is switched on) fetches a web page as a draft. With auto-sync on, the article is re-read every Sunday at 05:00 UTC and updated if the page changed.
5. **Page through** with Older articles; 25 show at a time.

## Common questions

### Why can't I edit an article?

It is Managed in repo. Its source is a Markdown file in the repository.

### Why can't the assistant find my article?

It is probably a Draft. Publish it. The search index is built in the background by an hourly sweep, so a newly published article can take up to an hour to be found.

### Can an agency's clients read an agency-level article?

That is set per article with **Visible to client users** (on by default).
