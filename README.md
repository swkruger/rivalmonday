# Rival Monday (codename: CompetitorSpy)

Evidence-backed competitor intelligence for local-service businesses, delivered by agencies.

Docs: [feasibility study](docs/research/2026-09-29-competitor-intel-feasibility-study.md) ·
[core platform spec](docs/superpowers/specs/2026-09-29-core-platform-design.md) ·
[roadmap](docs/superpowers/plans/2026-09-29-roadmap.md) ·
[brand](docs/brand/brand.md)

## Prerequisites
- Node 24 (>=22), pnpm 10 (`corepack enable`)
- A Postgres database — either a [Neon](https://neon.tech) project (what we use) or Docker

## Database setup

### Option A: Neon (what we use)

1. Create a Neon project and copy its connection string (the owner role) into `NEON_OWNER_URL` in the gitignored root `.env`. The owner/migration role must have `BYPASSRLS` — Neon's default owner role already does.
2. Using `NEON_OWNER_URL` (e.g. via `psql` or Neon's SQL editor), create the app roles and databases:
   ```sql
   CREATE ROLE app_user LOGIN PASSWORD '<strong password>';
   CREATE ROLE app_service LOGIN BYPASSRLS PASSWORD '<strong password>';
   CREATE DATABASE cs_dev;
   CREATE DATABASE cs_test;
   ```
3. Set the rest of `.env` from `.env.example`, pointing each variable at the matching role/database (never commit real values):
   - `DATABASE_URL` — owner role, `cs_dev` (migrations only)
   - `APP_DATABASE_URL` — `app_user`, `cs_dev` (application runtime, RLS enforced)
   - `SERVICE_DATABASE_URL` — `app_service`, `cs_dev` (system jobs, ledger/audit writes)
   - `TEST_DATABASE_URL` — owner role, `cs_test`
   - `TEST_APP_DATABASE_URL` — `app_user`, `cs_test`
   - `TEST_SERVICE_DATABASE_URL` — `app_service`, `cs_test`

Packages that touch the database (`@cs/db` and its consumers) load the root `.env` automatically via `process.loadEnvFile`, so nothing further needs to be sourced into your shell.

### Option B: Docker alternative

```bash
pnpm db:up   # Postgres 16 + pgvector; infra/db/init/01-roles.sql creates app_user, app_service, and cs_test
```
Then point `.env` at `localhost:5432` per `.env.example`. If the database volume existed before `infra/db/init` was added, recreate it: `docker compose down -v && pnpm db:up`.

## Setup

```bash
pnpm install
pnpm db:migrate
pnpm typecheck
pnpm test
```

## Packages
| Package | Purpose |
|---|---|
| `@cs/core` | Access context, permissions, domain constants, ledger contract, tool registry |
| `@cs/db` | Drizzle schema, migrations, RLS, `withTenant`, audit + ledger sinks |
| `@cs/ai` | OpenRouter chat, Jev decisions, LLM decisions, confidence cascade, `Ai` facade (config: `packages/ai/config/ai.yaml`) |
| `@cs/verticals` | Vertical packs (service catalogs, themes, weights, move thresholds, playbooks) |
| `@cs/worker` | pg-boss job runner |

The Jev live contract test (`packages/ai/src/decisions/jev.live.test.ts`) only runs when `TYPESAFE_API_KEY` is set; otherwise it's skipped.

## Database roles
- `postgres` / Neon owner (owner) — migrations only. Must have `BYPASSRLS`.
- `app_user` — application runtime; RLS always applies. Use `withTenant(db, ctx, fn)` for every tenant query. The `agency` table is read-only for `app_user` — agency writes go via the service role.
- `app_service` — `BYPASSRLS`; system jobs and ledger/audit writes only.

Every table in the `public` schema must have row-level security enabled and forced; a guard test enforces this.
