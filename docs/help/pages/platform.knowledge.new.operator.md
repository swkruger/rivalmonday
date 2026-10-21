---
help_key: page:platform.knowledge.new
audience: operator
title: New article
---
## What this page tells you

A form for writing an article the Ask assistant can search and cite.

- **Level** says who the article belongs to: Help (platform), Agency or Client. Agency and Client levels also ask which agency (and client).
- **Kind** is the type: help article, playbook, Q&A, blog post or fact.
- **Title** and a **Markdown body**, with a **Write** and a **Preview** tab.
- For an agency-level article, **Visible to client users** decides whether that agency's clients can read it as well as its staff. It is on by default. Platform and client-level articles do not show the option.

## How to use it

1. **Choose the level and kind**, then write the title and body.
2. **Check the Preview** tab to see how the Markdown reads.
3. **Save draft** keeps it out of the assistant's search. **Publish** makes it findable.
4. After the first save the page may show warnings about the text; read them before publishing.

## Common questions

### Can I use the product name?

For a platform-level article, write the product name as `{{product}}` and the assistant's name as `{{assistant}}`, so white-label agencies see their own. The editor warns when it finds the literal names.

### Where do page guides come from?

They live in the repository (`docs/help/pages`) and are seeded, not written here.
