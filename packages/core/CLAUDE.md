# @cs/core — working notes

## Gotchas
- **`GLOSSARY` entries (`src/help/glossary.ts`) must not contain `{x}` or `{{x}}` placeholders (standing rule, owner 2026-10-20):** one source feeds both the web renderer (single-brace `{client}`) and the KB seed (double-brace `{{client}}`), so each would leave the other kind literal. Write "the business" / "a chat answer" instead. Enforced by `glossary.test.ts` ("uses no placeholders…").
