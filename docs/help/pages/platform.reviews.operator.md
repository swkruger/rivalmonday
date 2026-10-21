---
help_key: page:platform.reviews
audience: operator
title: Model reviews
---
## What this page tells you

Decisions the models could not settle with enough confidence, waiting for a person. Your answer fixes the event and is stored as a gold label.

Competitor changes (a new page, a price, a service) are classified by a cascade:

1. **Jev** answers first.
2. Any answer under **0.85 confidence** goes to a **language model**.
3. If that answer is also under 0.85, the question lands **here** for a **person**.

The same 0.85 threshold is the verifier's, the check that every brief claim is supported. Each decision task has its own threshold in the AI configuration; today they are all 0.85 except the Ask interpretation check.

Each card shows the competitor, the source and kind of change, and the text before and after. Under it are the questions the models were unsure about, each with **Model said:** the model's answer and its confidence.

## How to use it

1. **Read the before and after text.** Then answer each question in the list.
2. **Press Resolve.** The event is created, corrected or removed as your answers imply, and your answers are saved as gold labels. Nothing on this page changes the thresholds.
3. **Work oldest first.** The queue is ordered by age and shows up to 50 at a time. Items whose change was superseded or suppressed are not listed.

## Common questions

### What does "Model said: No (20%)" mean?

The model's answer was No, with 20% confidence. Your answer replaces it.

### Should I change the threshold?

Not from this page. The project rule is to leave the verifier threshold at 0.85 until enough of these answers have been collected to measure it.

### Who can answer?

Any platform operator can; viewers included.
