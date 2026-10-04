# Phase 5a — App Foundation, Auth & Delivery Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first running Rival Monday web app: invitation-only sign-in (magic link + optional Google) via Better Auth, agency/client memberships that become an `AccessContext`, a per-agency themed app shell built to `docs/brand/mockups/`, the tool-registry read path the dashboard uses, the brief/alert/report pages that emails link to, the Phase 4b obligations (`/l/<token>`, `/go/<target>/<id>`, PDF downloads with on-demand rendering, the in-app inbox), and the agency settings screens that call the 4b service functions (team & invitations, branding, webhooks, client recipients & delivery mode, personal notification preferences).

**Architecture:** A new Next.js 16 App Router app (`apps/web`) reads everything through a new `@cs/tools` package: role-checked service functions (memberships, invitations, inbox, settings) plus the first tools registered in the existing `ToolRegistry` (`@cs/core`), so Phase 6's MCP server and Ask reuse the same code. Better Auth owns identity only (tables in a separate Postgres schema `auth`, service-role connection); our own `membership`/`invitation` tables (service-role only) map a user to an agency role and client scope, from which every request builds an `AccessContext` that `withTenant` turns into RLS settings. Brand tokens live in a new `@cs/ui` package (Tailwind CSS 4 + shadcn/ui) as CSS variables that the root layout overrides per agency from `resolveBranding()`.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`, React 19.3, Turbopack), Tailwind CSS 4.3, shadcn/ui (CLI 4.x, Radix, lucide-react), Better Auth 1.7.7 (Kysely `PostgresDialect` over `pg`, `magicLink` plugin, Google provider, `nextCookies`), Drizzle 0.44 / postgres.js (existing), pg-boss 10 (enqueue only), Vitest 3 + Testing Library + jsdom, Playwright Test 1.63 (E2E).

**Spec:** [docs/superpowers/specs/2026-09-29-core-platform-design.md](../specs/2026-09-29-core-platform-design.md) — §3 (tenancy, roles), §5 (dashboard), §8.1 (tool registry, access context), §9.2 (signed deep links, PDF), §9.3 (alert channels/preferences), §10.2–10.3 (frontend stack, Better Auth, multi-tenancy). Design reference: [docs/brand/brand.md](../../brand/brand.md) and [docs/brand/mockups/](../../brand/mockups/). Obligations from the [roadmap](2026-09-29-roadmap.md) "Phase 4b carry-over" section.

---

## Phase 5 overview (scope of 5a, 5b, 5c)

Phase 5 (roadmap estimate 4–5 weeks) is split like Phases 3 and 4. Each sub-plan is written after the previous one merges, against real code.

| Sub-phase | Delivers |
|---|---|
| **5a — App foundation, auth & delivery routes (this plan)** | `apps/web`, `@cs/ui`, `@cs/tools`; Better Auth (magic link, Google), memberships & invitations, session → `AccessContext`, guest (email-link) sessions; themed shell; tool registry wiring + read tools for clients, briefs, alerts, trend reports; brief/alert/report pages; `/l/<token>`, `/go/<target>/<id>`; PDF download + on-demand render; inbox; team & invitations, branding, webhooks, client recipients & delivery mode, personal notification preferences; admin bootstrap CLI; Playwright smoke E2E |
| **5b — Agency workflow** | Portfolio (alerts, briefs awaiting approval, pressure score, last activity); client onboarding (create client, services from the vertical catalog, service area, keywords, competitor suggestions + accept, tracked-page pin/unpin); approval queue (edit/drop/reorder/rate/approve/send now → enqueue `brief-pdf`, per-client auto-send); alert review queue (approve/dismiss); recommendations list/kanban for agency and client (status changes, dismiss reasons, retracting recommendations whose brief item was dropped at delivery — 4b parked item); playbook overrides editor; theme proposals + `decision_review` resolution queue; usage & limits (ledger per client vs cap, question quotas placeholder for Phase 6); prospecting brief |
| **5c — Client workspace intelligence** | Overview (module 1), competitors profile & timeline (2), changes feed + evidence viewer with before/after screenshots, highlighted diff, hash (3), pricing tracker charts (4), ads archive (5), reviews & reputation theme heatmap/benchmark (6), local-rankings geo-grid heatmap + share of voice (7), moves (8), settings — services & area, competitors & pages, alert rules / score thresholds, AI-connections placeholder for Phase 6 (11); the remaining §8.2 read tools these screens need |

## Global Constraints

- Node 24 locally, pnpm 10, Turborepo 2.11.5. Before changing `turbo.json`, read `node_modules/turbo/docs/README.md`, then `crafting-your-repository/using-environment-variables.mdx` and `guides/frameworks/nextjs.mdx` (repo `AGENTS.md` rule — the installed docs win over memory).
- Before writing Next.js code, read the bundled docs in `apps/web/node_modules/next/dist/docs/` for the API you touch. Next 16 facts this plan relies on (verified 2026-10-04 against `next@16.3.8`): `middleware.ts` is **deprecated and renamed `proxy.ts`**; `cookies()`, `headers()` and route/page `params`/`searchParams` are **async** (Promises).
- Versions (latest on 2026-10-04): `next@16.3.8`, `react@19.3.0`/`react-dom@19.3.0` (already used by `@cs/email`), `tailwindcss@4.3.3` + `@tailwindcss/postcss@4.3.3`, `better-auth@1.7.7`, `pg@^8.23.1` (already in the lockfile via pg-boss), `kysely@^0.28.17`, `@playwright/test@1.63.0`, `@testing-library/react@16.3.3`, `jsdom` (latest), `lucide-react` (latest), `shadcn@4.21.1` (CLI, via `pnpm dlx`).
- Do **not** add `@vitejs/plugin-react` (v6 needs a newer Vite than Vitest 3 ships); Vitest compiles TSX with `esbuild: { jsx: 'automatic' }`.
- Better Auth's tables live in Postgres schema **`auth`** (`schemaName: 'auth'`), are accessed only by the service role (`SERVICE_DATABASE_URL`), and are created by migration `0035_auth` from the SQL Better Auth itself generates (Task 1). Never let Better Auth run its own migrations at runtime.
- Better Auth user ids are **text** (`contact.user_id`, `membership.user_id`, `AccessContext.userId` are all text). Guest (email-link) viewers use `userId = 'contact:<contact uuid>'`.
- New tables `membership` and `invitation` are **service-role only** (forced RLS, no policy, every privilege revoked from `app_user`) — same rule as the 4b `contact`/`notification` tables. `@cs/tools` reads them only through role-checked functions.
- Every `.tsx` file in `@cs/email` starts with the two-line pragma `/** @jsxRuntime automatic */` + `/** @jsxImportSource react */` (`jsx-pragma.test.ts` enforces it).
- Client-facing read paths strip `upsell_tag` (spec §8.5; HANDOVER §6), show only `alert.status = 'delivered'`, only `brief.status IN ('approved','sent')`, and only `trend_report.status = 'sent'`.
- Permission failures and "not yours" both surface as **404** (`notFound()`), never 403 — spec §11 "no cross-tenant existence leaks".
- Brand: Inter; primary `#47A8E7` (white text accepted), secondary `#2A6BAC`, accent `#F5A524` (not overridable), ink `#0B2540`, canvas `#F6F9FC`, muted surface `#EEF2F6` with dark text, primary-soft `#E3F2FC` / text `#1F6FA8`; content max-width **1560px** centred; sidebar 232px white; cards radius 14px, shadow `0 1px 3px rgba(11,37,64,.06),0 1px 2px rgba(11,37,64,.04)`; wordmark `rival` secondary + `monday` accent, weight 800.
- LF line endings only. Commit trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (subagents may name their own model). Never stage `.env`, `.claude/`, `App/`, `.superpowers/`.
- Focused test runs: `pnpm --filter <pkg> exec vitest run <pattern>`. Full DB-backed package runs take minutes against Neon; never start two test runs at once (shared `cs_test`), and never hand back while a test run you started is still running.

## Review Focus

1. **A signed email link opened in a browser where someone else is signed in** — the link must not grant the signed-in user anything, and must not silently replace their session; expect the "this link belongs to another account" page (Task 15).
2. **`next` / redirect parameters** (`/sign-in?next=…`, link redirects) — anything that is not a same-origin path (`//evil.com`, `https://…`, `/\evil`) must fall back to `/` (Task 11).
3. **A revoked or deactivated recipient** — a contact deactivated, or whose links were revoked, after an email went out must not be able to open the old link, and an already-open guest session must stop working on its next request (Tasks 6, 11, 15).
4. **Removing a person** — revoking a membership must end that user's access on the next request (no cached context), and an admin must not be able to remove the agency's last admin (Task 3).
5. **Agency branding input** — a stored colour or logo URL that is not a 6-digit hex / `https` URL must never reach a `style` attribute or `<img src>` (Tasks 6, 7).

---

## Decisions

1. **Better Auth for identity only.** Better Auth (magic link, Google) owns `auth.user/session/account/verification/rateLimit`. Its `organization` plugin is **not** used: our roles carry client scopes and per-client feature flags that RLS and `@cs/core` already model, and a second org model would be a second source of truth. Agency/client access lives in our `membership` table. (Spec §10.2 allows "fallback if gaps found during planning"; OAuth 2.1 for MCP stays a Phase 6 question.)
2. **Invitation-only.** `sendMagicLink` silently sends nothing unless the email has a pending invitation or an existing membership (same "check your email" page either way — no account enumeration), and `databaseHooks.user.create.before` returns `false` for an email with no pending invitation (covers Google). Pending invitations are accepted at every session creation (`databaseHooks.session.create.after`) for a verified email. The first agency admin is bootstrapped with the `admin` CLI (Task 18).
3. **Membership → AccessContext.** `agency_admin` → scope `'all'`; `account_manager` → `client_scope` list, or `'all'` when NULL; `client_owner`/`client_viewer` → `[client_id]`. Features = `client.features` ∩ `FEATURES` for client roles, none for agency roles (agency roles bypass feature checks in `ToolRegistry`). Context is rebuilt from the database on every request (React `cache()` per request only) so revocation is immediate.
4. **Active membership** is a plain httpOnly cookie `rm_membership` holding a membership id; it is only ever matched against the signed-in user's own memberships, so it needs no signature. Missing/stale → the oldest membership.
5. **Every membership has a contact.** Accepting an invitation links an existing `contact` (same agency, same client or agency-level, same email) by setting `user_id`, or creates one with `addContact`; `membership.contact_id` points at it. The inbox reads `notification` rows of the viewer's contact(s).
6. **Guest sessions from email links.** `/l/<token>` for a **client** contact with no signed-in user sets `rm_guest`, an HMAC-signed 24-hour cookie (`LINK_SIGNING_SECRET`, domain-separated from link tokens) for that contact: role `client_viewer`, scope `[client]`, read-only. Each request re-checks that the contact is active and that the cookie was issued after `links_revoked_before`. An **agency** contact never gets a guest session: it is sent to `/sign-in?next=<destination>`. A link opened while a *different* user is signed in goes to `/link-other-account`.
7. **Link destinations:** `brief` → `/c/<client>/briefs/<id>`; `brief_item` → the item's brief + `#item-<id>`; `brief_pdf` → `/files/brief/<id>`; `alert` → `/c/<client>/alerts/<id>`; `trend_report` → `/c/<client>/reports/<id>`; `trend_report_pdf` → `/files/report/<id>`; `digest` and `notifications` → `/inbox`. `/go/<target>/<id>` resolves the same map behind login, finding the client through RLS-visible rows.
8. **PDFs on demand.** `/files/brief/<id>` and `/files/report/<id>` check access with the read tools, stream the stored PDF when `pdf_key` is set, otherwise enqueue `brief-pdf`/`report-pdf` (pg-boss `send` with a per-subject `singletonKey`) and return a small page that refreshes every 5 s. The web app enqueues with the owner `DATABASE_URL` like the worker does (least-privilege role still owed — Phase 7). Locally the web app's `ObjectStore` resolves a relative `EVIDENCE_FS_DIR` against `apps/worker/` so both processes share one directory.
9. **Tools package.** `packages/tools` (`@cs/tools`) holds the service functions and tool definitions shared by web (5a) and MCP/Ask (Phase 6). `@cs/core` keeps the registry mechanics. Registry deps: `{ app: Db; service: Db }`.
10. **Read tools in 5a:** `list_clients` (permission `agency`), `get_client_profile`, `list_briefs`, `get_brief`, `list_alerts`, `get_alert`, `list_trend_reports`, `get_trend_report` (all `read`, no feature flag — briefs-only clients see them). Dates are ISO strings in tool output.
11. **Settings permissions:** branding and webhooks — `agency_admin`; team — `agency_admin` invites/revokes any role, `account_manager` may invite/revoke client roles for clients in scope; client recipients and delivery mode/auto-send/timezone — agency roles with access to the client; personal notification preferences — every signed-in user for their own contacts (guests cannot edit).
12. **Theme:** `themeVars(branding)` emits only hex values that passed `resolveBranding` (6-digit hex), plus derived `--primary-soft` / `--primary-soft-text` (brand constants for the default primary, otherwise mixes). Before sign-in, branding comes from `DEFAULT_AGENCY_ID` when set (single host in MVP, spec §10.3), else Rival Monday defaults.
13. **Not in 5a:** everything in the 5b/5c rows above; Ask/MCP (Phase 6); passkeys/2FA; agency custom domains; SMS.

## File structure

```
packages/db/src/schema/access.ts              membership, invitation tables
packages/db/migrations/0033_membership.sql     generated
packages/db/migrations/0034_membership_rls.sql custom: revoke + forced RLS
packages/db/migrations/0035_auth.sql           custom: Better Auth schema "auth" + grants + membership.user_id FK
packages/db/test/global-setup.ts               also drops schema auth
packages/db/src/access.test.ts                 constraint/RLS tests

packages/tools/                                @cs/tools
  src/index.ts
  src/access/invitations.ts                    createInvitation, hasSignInRight, acceptInvitations
  src/access/memberships.ts                    listMemberships, pickMembership, accessContextFor, guestAccessFor
  src/access/team.ts                           listTeam, inviteMember, revokeMembership, revokeInvitation
  src/registry.ts                              createToolRegistry, ToolDeps
  src/tools/schemas.ts                         shared Zod output schemas
  src/tools/clients.ts                         list_clients, get_client_profile
  src/tools/briefs.ts                          list_briefs, get_brief
  src/tools/alerts.ts                          list_alerts, get_alert
  src/tools/reports.ts                         list_trend_reports, get_trend_report
  src/inbox.ts                                 listInbox, unreadCount, markRead, markAllRead
  src/preferences.ts                           myNotificationSettings, setMyNotificationPref, updateMyContact
  src/settings.ts                              branding, webhooks, client recipients, client delivery
  test/fixtures.ts                             seed helpers (agency/users/contacts)

packages/ui/                                   @cs/ui
  src/styles.css                               Tailwind 4 theme + brand tokens
  src/theme.ts                                 themeVars
  src/lib/cn.ts
  src/components/*.tsx                         shadcn components + Wordmark, FridayBadge

packages/email/src/templates/sign-in.tsx       magic-link email

apps/web/                                      @cs/web (Next.js 16)
  next.config.ts, postcss.config.mjs, tsconfig.json, vitest.config.ts, playwright.config.ts
  src/proxy.ts
  src/server/{env,db,auth,viewer,guest,safe-next,tools,links,queue,files,theme}.ts
  src/lib/auth-client.ts
  src/app/...                                  routes listed per task
  src/components/...                           shell + views
  scripts/admin.ts                             bootstrap CLI
  e2e/smoke.spec.ts
```

---

### Task 1: Membership, invitation and auth-schema migrations

**Files:**
- Create: `packages/db/src/schema/access.ts`
- Modify: `packages/db/src/schema/index.ts` (export `./access`)
- Create: `packages/db/migrations/0033_membership.sql` (generated), `0034_membership_rls.sql`, `0035_auth.sql` (custom)
- Modify: `packages/db/test/global-setup.ts`
- Test: `packages/db/src/access.test.ts`

**Interfaces:**
- Produces: Drizzle tables `membership`, `invitation` (exported from `@cs/db`); Postgres schema `auth` with tables `"user"`, `session`, `account`, `verification`, `"rateLimit"` (camelCase columns, Better Auth defaults); FK `membership.user_id → auth."user"(id) ON DELETE CASCADE`.

- [ ] **Step 1: Write the schema**

`packages/db/src/schema/access.ts`:

```ts
import { sql } from 'drizzle-orm';
import { foreignKey, index, check, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { contact } from './delivery';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Phase 5a decision 1: who may act for an agency, and over which clients. One row per user × agency × client scope.
 * Service role only (forced RLS, no policy): @cs/tools reads it through role-checked functions.
 */
export const membership = pgTable(
  'membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Better Auth user id (text) in auth."user"; FK added by migration 0035. */
    userId: text('user_id').notNull(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    /** Client roles only. */
    clientId: uuid('client_id'),
    /** Account managers only: assigned clients; NULL = every client of the agency. */
    clientScope: jsonb('client_scope').$type<string[] | null>(),
    /** Decision 5: the contact that receives this person's notifications. */
    contactId: uuid('contact_id').references(() => contact.id, { onDelete: 'set null' }),
    createdBy: text('created_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('membership_user_scope_unique').on(t.userId, t.agencyId, sql`coalesce(${t.clientId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
    index('membership_agency_idx').on(t.agencyId),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('membership_role_check', sql`role IN ('agency_admin', 'account_manager', 'client_owner', 'client_viewer')`),
    check('membership_role_scope_check', sql`(client_id IS NULL) = (role IN ('agency_admin', 'account_manager'))`),
    check('membership_client_scope_check', sql`client_scope IS NULL OR (role = 'account_manager' AND jsonb_typeof(client_scope) = 'array' AND jsonb_array_length(client_scope) > 0)`),
  ],
);

/** Phase 5a decision 2: a pending right to sign in and become a member. Service role only. */
export const invitation = pgTable(
  'invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    clientId: uuid('client_id'),
    clientScope: jsonb('client_scope').$type<string[] | null>(),
    invitedBy: text('invited_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    acceptedAt: ts('accepted_at'),
    acceptedBy: text('accepted_by'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    uniqueIndex('invitation_pending_unique')
      .on(t.agencyId, sql`coalesce(${t.clientId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`lower(${t.email})`)
      .where(sql`accepted_at IS NULL AND revoked_at IS NULL`),
    index('invitation_email_idx').on(sql`lower(${t.email})`),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('invitation_role_check', sql`role IN ('agency_admin', 'account_manager', 'client_owner', 'client_viewer')`),
    check('invitation_role_scope_check', sql`(client_id IS NULL) = (role IN ('agency_admin', 'account_manager'))`),
    check('invitation_client_scope_check', sql`client_scope IS NULL OR (role = 'account_manager' AND jsonb_typeof(client_scope) = 'array' AND jsonb_array_length(client_scope) > 0)`),
    check('invitation_email_check', sql`email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'`),
  ],
);
```

Add `export * from './access';` to `packages/db/src/schema/index.ts` (alphabetical: first line).

- [ ] **Step 2: Generate 0033 and write the custom migrations**

Run: `pnpm --filter @cs/db generate --name=membership` → `migrations/0033_membership.sql`. Inspect it: the composite FKs must come after the `client_id_agency_id_unique` constraint they need (already exists since 0002 — fine), and the partial unique index must keep its `WHERE`.

Run: `pnpm --filter @cs/db generate --custom --name=membership_rls` and write `0034_membership_rls.sql`:

```sql
-- Phase 5a: memberships and invitations are service-role only, like contact/notification (Phase 4b decision 19).
REVOKE ALL ON membership, invitation FROM app_user;
--> statement-breakpoint
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membership FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitation ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invitation FORCE ROW LEVEL SECURITY;
```

Run: `pnpm --filter @cs/db generate --custom --name=auth` and write `0035_auth.sql`. The table SQL below is **exactly** what Better Auth 1.7.7's `getMigrations(...).compileMigrations()` produced on 2026-10-04 for `{ schemaName, rateLimit: { storage: 'database' }, plugins: [magicLink] }` (the magic-link plugin adds no tables); Task 10 adds a drift test that fails if the runtime config ever disagrees:

```sql
-- Phase 5a decision 1: Better Auth identity tables, in their own schema so public-schema guards stay unchanged.
-- Generated by better-auth@1.7.7 getMigrations().compileMigrations(); never edited by Better Auth at runtime.
CREATE SCHEMA IF NOT EXISTS auth;
--> statement-breakpoint
create table "auth"."user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
--> statement-breakpoint
create table "auth"."session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "auth"."user" ("id") on delete cascade);
--> statement-breakpoint
create table "auth"."account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "auth"."user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);
--> statement-breakpoint
create table "auth"."verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);
--> statement-breakpoint
create table "auth"."rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
--> statement-breakpoint
create index "session_userId_idx" on "auth"."session" ("userId");
--> statement-breakpoint
create index "account_userId_idx" on "auth"."account" ("userId");
--> statement-breakpoint
create index "verification_identifier_idx" on "auth"."verification" ("identifier");
--> statement-breakpoint
-- Emails are compared case-insensitively everywhere (invitations, contacts).
create index "user_email_lower_idx" on "auth"."user" (lower("email"));
--> statement-breakpoint
-- Only the service role (Better Auth's connection, @cs/tools) touches auth.*; app_user gets nothing.
GRANT USAGE ON SCHEMA auth TO app_service;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO app_service;
--> statement-breakpoint
ALTER TABLE membership ADD CONSTRAINT membership_user_id_fk FOREIGN KEY (user_id) REFERENCES auth."user"(id) ON DELETE CASCADE;
```

- [ ] **Step 3: Make the test database reset drop the auth schema**

In `packages/db/test/global-setup.ts`, change the reset statement to:

```ts
    await sql.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
```

- [ ] **Step 4: Write the failing tests**

`packages/db/src/access.test.ts`:

```ts
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { invitation, membership } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

async function seedUser(id: string, email: string) {
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${email}, ${email}, true)`);
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await seedUser('u1', 'one@example.com');
});

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

describe('membership', () => {
  it('stores an agency admin with no client', async () => {
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'test' });
    expect(await dbs.service.select().from(membership)).toHaveLength(1);
  });

  it('requires a client for client roles and forbids one for agency roles', async () => {
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_owner', createdBy: 't' }))).toMatch(/membership_role_scope_check/);
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', clientId: IDS.clientA1, createdBy: 't' }))).toMatch(/membership_role_scope_check/);
  });

  it('allows client_scope only for account managers and never empty', async () => {
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', clientScope: [IDS.clientA1], createdBy: 't' }))).toMatch(/membership_client_scope_check/);
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'account_manager', clientScope: [], createdBy: 't' }))).toMatch(/membership_client_scope_check/);
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'account_manager', clientScope: [IDS.clientA1], createdBy: 't' });
  });

  it('rejects a client of another agency (composite FK)', async () => {
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientB1, createdBy: 't' }))).toMatch(/foreign key/);
  });

  it('rejects an unknown user and cascades when the user is deleted', async () => {
    expect(await errorText(dbs.service.insert(membership).values({ userId: 'nobody', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' }))).toMatch(/membership_user_id_fk/);
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't' });
    await dbs.owner.execute(sql`delete from auth."user" where id = 'u1'`);
    expect(await dbs.service.select().from(membership)).toHaveLength(0);
  });

  it('is invisible and read-only to app_user', async () => {
    expect(await errorText(dbs.app.select().from(membership))).toMatch(/permission denied/);
    expect(await errorText(dbs.app.select().from(invitation))).toMatch(/permission denied/);
    expect(await errorText(dbs.app.execute(sql`select * from auth."user"`))).toMatch(/permission denied/);
  });
});

describe('invitation', () => {
  it('allows one pending invitation per agency, client and email, case-insensitively', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'New@Example.com', role: 'agency_admin', invitedBy: 't', expiresAt: inDays(14) });
    expect(await errorText(dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'new@example.com', role: 'account_manager', invitedBy: 't', expiresAt: inDays(14) }))).toMatch(/invitation_pending_unique/);
    await dbs.service.update(invitation).set({ revokedAt: new Date() });
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'new@example.com', role: 'account_manager', invitedBy: 't', expiresAt: inDays(14) });
  });

  it('rejects malformed emails', async () => {
    expect(await errorText(dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'nope', role: 'agency_admin', invitedBy: 't', expiresAt: inDays(1) }))).toMatch(/invitation_email_check/);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cs/db exec vitest run src/access.test.ts` (global setup re-migrates `cs_test`, including 0033–0035).
Expected: PASS. Then run `pnpm --filter @cs/db exec vitest run src/evidence.test.ts` — the privilege guard must still pass unchanged (the new tables grant `app_user` nothing).

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): membership, invitation and Better Auth schema migrations"
```

---

### Task 2: `@cs/tools` package — invitations

**Files:**
- Create: `packages/tools/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/access/invitations.ts`, `test/fixtures.ts`
- Test: `packages/tools/src/access/invitations.test.ts`

**Interfaces:**
- Consumes: `membership`, `invitation`, `contact`, `client` (`@cs/db`); `addContact` (`@cs/engine`); `ROLES`, `Role`, `ToolError`, `isUuid`, `isAgencyRole` (`@cs/core`).
- Produces:
  - `INVITATION_TTL_DAYS = 14`
  - `interface NewInvitation { agencyId: string; email: string; role: Role; clientId?: string | null; clientScope?: string[] | null; invitedBy: string }`
  - `invitationProblem(i: NewInvitation): string | null`
  - `createInvitation(service: Db, input: NewInvitation, now?: Date): Promise<{ id: string; expiresAt: Date }>`
  - `hasSignInRight(service: Db, email: string, now?: Date): Promise<boolean>`
  - `acceptInvitations(service: Db, user: { id: string; email: string; name?: string | null }, now?: Date): Promise<string[]>` (new membership ids)
  - test helpers `seedUser(owner, id, email)`, `truncateAuth(owner)` in `test/fixtures.ts`

- [ ] **Step 1: Scaffold the package**

`packages/tools/package.json`:

```json
{
  "name": "@cs/tools",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p .",
    "test": "vitest run"
  },
  "dependencies": {
    "@cs/core": "workspace:*",
    "@cs/db": "workspace:*",
    "@cs/email": "workspace:*",
    "@cs/engine": "workspace:*",
    "drizzle-orm": "^0.44.5",
    "zod": "^4.1.5"
  },
  "devDependencies": {
    "@types/node": "^22.18.0",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```

`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2023", "DOM"], "jsx": "react-jsx" }, "include": ["src", "test", "vitest.config.ts"] }` (DOM/JSX because it type-checks through `@cs/engine` → `@cs/email`).

`vitest.config.ts`: copy `packages/engine/vitest.config.ts` verbatim (it loads `../../.env` and uses `../db/test/global-setup.ts`).

`test/fixtures.ts`:

```ts
import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

export async function seedUser(owner: Db, id: string, email: string, verified = true): Promise<void> {
  await owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${email}, ${email}, ${verified})`);
}

export async function truncateAuth(owner: Db): Promise<void> {
  await owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
}
```

Run `pnpm install` from the repo root.

- [ ] **Step 2: Write the failing tests**

`packages/tools/src/access/invitations.test.ts`:

```ts
import { contact, invitation, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { acceptInvitations, createInvitation, hasSignInRight, invitationProblem } from './invitations';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
});
const NOW = new Date('2026-10-05T12:00:00Z');

describe('invitationProblem', () => {
  const base = { agencyId: IDS.agencyA, email: 'a@b.co', invitedBy: 'x' };
  it('accepts valid shapes', () => {
    expect(invitationProblem({ ...base, role: 'agency_admin' })).toBeNull();
    expect(invitationProblem({ ...base, role: 'client_viewer', clientId: IDS.clientA1 })).toBeNull();
    expect(invitationProblem({ ...base, role: 'account_manager', clientScope: [IDS.clientA1] })).toBeNull();
  });
  it('rejects bad shapes', () => {
    expect(invitationProblem({ ...base, email: 'nope', role: 'agency_admin' })).toMatch(/email/);
    expect(invitationProblem({ ...base, role: 'client_owner' })).toMatch(/client/);
    expect(invitationProblem({ ...base, role: 'agency_admin', clientId: IDS.clientA1 })).toMatch(/client/);
    expect(invitationProblem({ ...base, role: 'agency_admin', clientScope: [IDS.clientA1] })).toMatch(/scope/);
    expect(invitationProblem({ ...base, role: 'account_manager', clientScope: [] })).toMatch(/scope/);
    expect(invitationProblem({ ...base, role: 'owner' as never })).toMatch(/role/);
  });
});

describe('createInvitation', () => {
  it('stores a lower-cased, trimmed email with a 14-day expiry', async () => {
    const r = await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: '  Pat@Example.COM ', role: 'agency_admin', invitedBy: 'x' }, NOW);
    expect(r.expiresAt.toISOString()).toBe('2026-10-19T12:00:00.000Z');
    const [row] = await dbs.service.select().from(invitation).where(eq(invitation.id, r.id));
    expect(row!.email).toBe('pat@example.com');
  });

  it('replaces a previous pending invitation for the same scope', async () => {
    const a = await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'agency_admin', invitedBy: 'x' }, NOW);
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'P@e.co', role: 'account_manager', invitedBy: 'x' }, NOW);
    const [old] = await dbs.service.select().from(invitation).where(eq(invitation.id, a.id));
    expect(old!.revokedAt).not.toBeNull();
  });

  it('refuses a client or scoped client of another agency', async () => {
    await expect(createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'client_owner', clientId: IDS.clientB1, invitedBy: 'x' }, NOW)).rejects.toMatchObject({ code: 'not_found' });
    await expect(createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'account_manager', clientScope: [IDS.clientA1, IDS.clientB1], invitedBy: 'x' }, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('hasSignInRight', () => {
  it('is true for a pending, unexpired invitation (any case) and false otherwise', async () => {
    expect(await hasSignInRight(dbs.service, 'p@e.co', NOW)).toBe(false);
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'agency_admin', invitedBy: 'x' }, NOW);
    expect(await hasSignInRight(dbs.service, 'P@E.CO', NOW)).toBe(true);
    expect(await hasSignInRight(dbs.service, 'p@e.co', new Date('2026-11-01T00:00:00Z'))).toBe(false);
  });

  it('is true for an existing user with a membership, false for one without', async () => {
    await seedUser(dbs.owner, 'u1', 'member@e.co');
    expect(await hasSignInRight(dbs.service, 'member@e.co', NOW)).toBe(false);
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'x' });
    expect(await hasSignInRight(dbs.service, 'Member@E.co', NOW)).toBe(true);
  });
});

describe('acceptInvitations', () => {
  it('turns every pending invitation for the email into a membership with a linked contact', async () => {
    await seedUser(dbs.owner, 'u1', 'p@e.co');
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'account_manager', clientScope: [IDS.clientA1], invitedBy: 'x' }, NOW);
    await createInvitation(dbs.service, { agencyId: IDS.agencyB, email: 'p@e.co', role: 'client_viewer', clientId: IDS.clientB1, invitedBy: 'x' }, NOW);
    const ids = await acceptInvitations(dbs.service, { id: 'u1', email: 'P@e.co', name: 'Pat' }, NOW);
    expect(ids).toHaveLength(2);
    const rows = await dbs.service.select().from(membership);
    expect(rows.map((m) => m.role).sort()).toEqual(['account_manager', 'client_viewer']);
    const contacts = await dbs.service.select().from(contact);
    expect(contacts).toHaveLength(2);
    expect(contacts.every((c) => c.userId === 'u1')).toBe(true);
    expect(rows.every((m) => m.contactId !== null)).toBe(true);
    const am = contacts.find((c) => c.role === 'account_manager')!;
    expect(am.clientScope).toEqual([IDS.clientA1]);
    expect((await dbs.service.select().from(invitation)).every((i) => i.acceptedBy === 'u1')).toBe(true);
  });

  it('links an existing contact with the same email instead of creating one', async () => {
    await seedUser(dbs.owner, 'u1', 'p@e.co');
    await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'P@E.co', active: false });
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'client_owner', clientId: IDS.clientA1, invitedBy: 'x' }, NOW);
    await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW);
    const contacts = await dbs.service.select().from(contact);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ userId: 'u1', active: true });
  });

  it('ignores expired and revoked invitations and is idempotent', async () => {
    await seedUser(dbs.owner, 'u1', 'p@e.co');
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'agency_admin', invitedBy: 'x' }, new Date('2026-09-01T00:00:00Z'));
    expect(await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW)).toEqual([]);
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'agency_admin', invitedBy: 'x' }, NOW);
    expect(await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW)).toHaveLength(1);
    expect(await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW)).toEqual([]);
  });

  it('keeps an existing membership for the same scope and updates its role', async () => {
    await seedUser(dbs.owner, 'u1', 'p@e.co');
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_viewer', clientId: IDS.clientA1, createdBy: 'x' });
    await createInvitation(dbs.service, { agencyId: IDS.agencyA, email: 'p@e.co', role: 'client_owner', clientId: IDS.clientA1, invitedBy: 'x' }, NOW);
    await acceptInvitations(dbs.service, { id: 'u1', email: 'p@e.co' }, NOW);
    const rows = await dbs.service.select().from(membership);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.role).toBe('client_owner');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @cs/tools exec vitest run src/access/invitations.test.ts`
Expected: FAIL — `./invitations` does not exist.

- [ ] **Step 4: Implement**

`packages/tools/src/access/invitations.ts`:

```ts
import { isAgencyRole, isUuid, type Role, ROLES, ToolError } from '@cs/core';
import { client, contact, type Db, invitation, membership, type Tx } from '@cs/db';
import { addContact } from '@cs/engine';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

export const INVITATION_TTL_DAYS = 14;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_SCOPE = 500;

export interface NewInvitation {
  agencyId: string;
  email: string;
  role: Role;
  clientId?: string | null;
  clientScope?: string[] | null;
  invitedBy: string;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const sameClient = (col: typeof invitation.clientId | typeof contact.clientId | typeof membership.clientId, clientId: string | null) =>
  clientId ? eq(col, clientId) : isNull(col);

/** Shape rules shared with the DB CHECKs (decision 3); returns a human-readable problem or null. */
export function invitationProblem(i: NewInvitation): string | null {
  if (!EMAIL.test(normalizeEmail(i.email))) return 'Enter a valid email address';
  if (!(ROLES as readonly string[]).includes(i.role)) return `Unknown role ${i.role}`;
  const agencyRole = isAgencyRole(i.role);
  if (agencyRole && i.clientId) return 'Agency roles are not tied to one client';
  if (!agencyRole && !(i.clientId && isUuid(i.clientId))) return 'Client roles need a client';
  if (i.clientScope != null) {
    if (i.role !== 'account_manager') return 'Only account managers have a client scope';
    if (i.clientScope.length === 0 || i.clientScope.length > MAX_SCOPE || !i.clientScope.every(isUuid)) return 'The client scope must list 1-500 clients';
  }
  return null;
}

async function assertAgencyClients(tx: Tx, agencyId: string, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await tx.select({ id: client.id }).from(client).where(and(eq(client.agencyId, agencyId), inArray(client.id, ids)));
  if (rows.length !== new Set(ids).size) throw new ToolError('not_found', 'Client not found');
}

/** Low-level (not permission-checked): used by `inviteMember` (Task 3) and the admin CLI (Task 18). */
export async function createInvitation(service: Db, input: NewInvitation, now = new Date()): Promise<{ id: string; expiresAt: Date }> {
  const problem = invitationProblem(input);
  if (problem) throw new ToolError('invalid_input', problem);
  const email = normalizeEmail(input.email);
  const clientId = input.clientId ?? null;
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000);
  return service.transaction(async (tx) => {
    await assertAgencyClients(tx, input.agencyId, [...(clientId ? [clientId] : []), ...(input.clientScope ?? [])]);
    await tx.update(invitation).set({ revokedAt: now }).where(and(
      eq(invitation.agencyId, input.agencyId), sameClient(invitation.clientId, clientId), sql`lower(${invitation.email}) = ${email}`,
      isNull(invitation.acceptedAt), isNull(invitation.revokedAt),
    ));
    const [row] = await tx.insert(invitation).values({
      agencyId: input.agencyId, email, role: input.role, clientId, clientScope: input.clientScope ?? null, invitedBy: input.invitedBy, createdAt: now, expiresAt,
    }).returning({ id: invitation.id });
    return { id: row!.id, expiresAt };
  });
}

/** Decision 2: only invited people, or users who still hold a membership, may receive a sign-in link. */
export async function hasSignInRight(service: Db, email: string, now = new Date()): Promise<boolean> {
  const e = normalizeEmail(email);
  const rows = await service.execute(sql`
    select 1 from invitation where lower(email) = ${e} and accepted_at is null and revoked_at is null and expires_at > ${now}
    union all
    select 1 from membership m join auth."user" u on u.id = m.user_id where lower(u.email) = ${e}
    limit 1`);
  return rows.length > 0;
}

/** Links (or creates) the contact that receives this member's notifications (decision 5). */
async function contactFor(tx: Tx, inv: typeof invitation.$inferSelect, user: { id: string; name?: string | null }): Promise<string> {
  const [existing] = await tx.select({ id: contact.id }).from(contact).where(and(
    eq(contact.agencyId, inv.agencyId), sameClient(contact.clientId, inv.clientId), sql`lower(${contact.email}) = ${inv.email}`,
  ));
  if (existing) {
    await tx.update(contact).set({ userId: user.id, active: true, role: inv.role, clientScope: inv.clientScope ?? null }).where(eq(contact.id, existing.id));
    return existing.id;
  }
  return addContact(tx as unknown as Db, {
    agencyId: inv.agencyId, clientId: inv.clientId, role: inv.role as Role, email: inv.email, name: user.name ?? null, clientScope: inv.clientScope ?? null, userId: user.id,
  });
}

/** Runs at every session creation for a verified email (decision 2); returns the ids of memberships it created or updated. */
export async function acceptInvitations(service: Db, user: { id: string; email: string; name?: string | null }, now = new Date()): Promise<string[]> {
  const email = normalizeEmail(user.email);
  return service.transaction(async (tx) => {
    const pending = await tx.select().from(invitation).where(and(
      sql`lower(${invitation.email}) = ${email}`, isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, now),
    )).for('update');
    const ids: string[] = [];
    for (const inv of pending) {
      const contactId = await contactFor(tx, inv, user);
      const [m] = await tx.insert(membership).values({
        userId: user.id, agencyId: inv.agencyId, role: inv.role, clientId: inv.clientId, clientScope: inv.clientScope, contactId, createdBy: inv.invitedBy, createdAt: now,
      }).onConflictDoUpdate({
        target: [membership.userId, membership.agencyId, sql`coalesce(${membership.clientId}, '00000000-0000-0000-0000-000000000000'::uuid)`],
        set: { role: inv.role, clientScope: inv.clientScope, contactId },
      }).returning({ id: membership.id });
      await tx.update(invitation).set({ acceptedAt: now, acceptedBy: user.id }).where(eq(invitation.id, inv.id));
      ids.push(m!.id);
    }
    return ids;
  });
}
```

`addContact` (4b, `packages/engine/src/delivery/contacts.ts:66`) takes a `Db` and has no `userId` field. Extend it minimally: change its first parameter type to `Conn` (`Db | Tx`, already exported there) and add `userId?: string | null` to `NewContact`, written to `contact.user_id`. Drop the `as unknown as Db` cast above once `Conn` is accepted. Keep every existing `addContact` test green (`pnpm --filter @cs/engine exec vitest run contacts`).

The unique index is on an expression (`coalesce(client_id, …)`). If drizzle 0.44 will not accept that `sql` expression in `onConflictDoUpdate`'s `target` (typecheck error, or Postgres "there is no unique or exclusion constraint matching the ON CONFLICT specification"), replace the upsert with a `select … for update` of the existing row for `(user_id, agency_id, client scope)` followed by an `update` or an `insert` — the test "keeps an existing membership for the same scope and updates its role" covers both paths.

`packages/tools/src/index.ts`:

```ts
export * from './access/invitations';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cs/tools exec vitest run src/access/invitations.test.ts` and `pnpm --filter @cs/engine exec vitest run contacts`
Expected: PASS. Run `pnpm --filter @cs/tools typecheck`.

- [ ] **Step 6: Commit**

```bash
git add packages/tools packages/engine/src/delivery/contacts.ts pnpm-lock.yaml
git commit -m "feat(tools): invitations, sign-in right and invitation acceptance"
```

---

### Task 3: Memberships → AccessContext, and team management

**Files:**
- Create: `packages/tools/src/access/memberships.ts`, `packages/tools/src/access/team.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/src/access/memberships.test.ts`, `packages/tools/src/access/team.test.ts`

**Interfaces:**
- Consumes: Task 2 (`createInvitation`, `normalizeEmail`, `NewInvitation`); `createAccessContext`, `canAccessClient`, `FEATURES`, `Feature`, `isAgencyRole` (`@cs/core`).
- Produces:
  - `interface MembershipSummary { id: string; agencyId: string; agencyName: string; role: Role; clientId: string | null; clientName: string | null; clientScope: string[] | null; contactId: string | null; createdAt: Date }`
  - `listMemberships(service: Db, userId: string): Promise<MembershipSummary[]>` (oldest first)
  - `pickMembership(list: MembershipSummary[], wantedId: string | undefined): MembershipSummary | null`
  - `accessContextFor(service: Db, userId: string, m: MembershipSummary): Promise<AccessContext>`
  - `interface GuestSessionClaims { contactId: string; agencyId: string; clientId: string; iat: number }`
  - `guestAccessFor(service: Db, g: GuestSessionClaims): Promise<AccessContext | null>`
  - `interface TeamMember { membershipId: string; userId: string; email: string; name: string; role: Role; clientId: string | null; clientName: string | null; clientScope: string[] | null }`, `interface PendingInvite { id: string; email: string; role: Role; clientId: string | null; clientName: string | null; expiresAt: Date }`
  - `listTeam(service: Db, ctx: AccessContext, now?: Date): Promise<{ members: TeamMember[]; invitations: PendingInvite[] }>`
  - `inviteMember(service: Db, ctx: AccessContext, input: Omit<NewInvitation, 'agencyId' | 'invitedBy'>, now?: Date): Promise<{ id: string; expiresAt: Date }>`
  - `revokeMembership(service: Db, ctx: AccessContext, membershipId: string, now?: Date): Promise<void>`
  - `revokeInvitation(service: Db, ctx: AccessContext, invitationId: string, now?: Date): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/access/memberships.test.ts`:

```ts
import { client, contact, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { accessContextFor, guestAccessFor, listMemberships, pickMembership } from './memberships';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'u1', 'p@e.co');
});

async function member(values: Partial<typeof membership.$inferInsert>) {
  const [m] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't', ...values }).returning();
  return m!;
}

describe('listMemberships / pickMembership', () => {
  it('lists the user memberships oldest first with agency and client names', async () => {
    await member({ role: 'client_owner', clientId: IDS.clientA1, createdAt: new Date('2026-10-02T00:00:00Z') });
    await member({ agencyId: IDS.agencyB, role: 'agency_admin', createdAt: new Date('2026-10-01T00:00:00Z') });
    const list = await listMemberships(dbs.service, 'u1');
    expect(list.map((m) => [m.agencyName, m.clientName])).toEqual([['Agency B', null], ['Agency A', 'A1 HVAC']]);
    expect(pickMembership(list, undefined)?.agencyName).toBe('Agency B');
    expect(pickMembership(list, list[1]!.id)?.clientName).toBe('A1 HVAC');
    expect(pickMembership(list, 'not-mine')?.agencyName).toBe('Agency B');
    expect(pickMembership([], undefined)).toBeNull();
  });
});

describe('accessContextFor', () => {
  it('gives agency admins every client', async () => {
    await member({});
    const [m] = await listMemberships(dbs.service, 'u1');
    const ctx = await accessContextFor(dbs.service, 'u1', m!);
    expect(ctx).toMatchObject({ agencyId: IDS.agencyA, userId: 'u1', role: 'agency_admin', clientScope: 'all' });
  });

  it('scopes account managers to their list, or all when NULL', async () => {
    await member({ role: 'account_manager', clientScope: [IDS.clientA2] });
    const [m] = await listMemberships(dbs.service, 'u1');
    expect((await accessContextFor(dbs.service, 'u1', m!)).clientScope).toEqual([IDS.clientA2]);
  });

  it('gives client roles their client and the client feature flags (unknown flags dropped)', async () => {
    await dbs.owner.update(client).set({ features: ['dashboard', 'briefs_only', 'bogus'] }).where(eq(client.id, IDS.clientA1));
    await member({ role: 'client_viewer', clientId: IDS.clientA1 });
    const [m] = await listMemberships(dbs.service, 'u1');
    const ctx = await accessContextFor(dbs.service, 'u1', m!);
    expect(ctx.clientScope).toEqual([IDS.clientA1]);
    expect([...ctx.features]).toEqual(['dashboard']);
  });
});

describe('guestAccessFor', () => {
  async function clientContact(values: Partial<typeof contact.$inferInsert> = {}) {
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'g@e.co', ...values }).returning();
    return c!;
  }
  const iat = Math.floor(new Date('2026-10-05T12:00:00Z').getTime() / 1000);

  it('gives an active client contact a read-only client_viewer context', async () => {
    const c = await clientContact();
    const ctx = await guestAccessFor(dbs.service, { contactId: c.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, iat });
    expect(ctx).toMatchObject({ userId: `contact:${c.id}`, role: 'client_viewer', clientScope: [IDS.clientA1] });
  });

  it('refuses inactive contacts, revoked links, agency contacts and mismatched claims', async () => {
    const inactive = await clientContact({ active: false });
    expect(await guestAccessFor(dbs.service, { contactId: inactive.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, iat })).toBeNull();
    const revoked = await clientContact({ email: 'r@e.co', linksRevokedBefore: new Date('2026-10-06T00:00:00Z') });
    expect(await guestAccessFor(dbs.service, { contactId: revoked.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, iat })).toBeNull();
    const [agencyContact] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'account_manager', email: 'am@e.co' }).returning();
    expect(await guestAccessFor(dbs.service, { contactId: agencyContact!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1, iat })).toBeNull();
    const ok = await clientContact({ email: 'ok@e.co' });
    expect(await guestAccessFor(dbs.service, { contactId: ok.id, agencyId: IDS.agencyB, clientId: IDS.clientA1, iat })).toBeNull();
    expect(await guestAccessFor(dbs.service, { contactId: ok.id, agencyId: IDS.agencyA, clientId: IDS.clientA2, iat })).toBeNull();
  });
});
```

`packages/tools/src/access/team.test.ts`:

```ts
import { createAccessContext } from '@cs/core';
import { contact, invitation, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { inviteMember, listTeam, revokeInvitation, revokeMembership } from './team';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-05T12:00:00Z');
const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] });
const am = createAccessContext({ agencyId: IDS.agencyA, userId: 'am', role: 'account_manager', clientScope: [IDS.clientA1], features: [] });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'own', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await seedUser(dbs.owner, 'admin', 'admin@e.co');
  await seedUser(dbs.owner, 'am', 'am@e.co');
  await dbs.service.insert(membership).values([
    { userId: 'admin', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 'seed' },
    { userId: 'am', agencyId: IDS.agencyA, role: 'account_manager', clientScope: [IDS.clientA1], createdBy: 'seed' },
  ]);
});

describe('inviteMember', () => {
  it('lets admins invite any role in their agency', async () => {
    await inviteMember(dbs.service, admin, { email: 'x@e.co', role: 'agency_admin' }, NOW);
    await inviteMember(dbs.service, admin, { email: 'y@e.co', role: 'client_owner', clientId: IDS.clientA2 }, NOW);
    expect(await dbs.service.select().from(invitation)).toHaveLength(2);
  });

  it('lets account managers invite client roles for clients in scope only', async () => {
    await inviteMember(dbs.service, am, { email: 'y@e.co', role: 'client_viewer', clientId: IDS.clientA1 }, NOW);
    await expect(inviteMember(dbs.service, am, { email: 'y@e.co', role: 'client_viewer', clientId: IDS.clientA2 }, NOW)).rejects.toMatchObject({ code: 'not_found' });
    await expect(inviteMember(dbs.service, am, { email: 'z@e.co', role: 'account_manager' }, NOW)).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('refuses client roles', async () => {
    await expect(inviteMember(dbs.service, owner, { email: 'v@e.co', role: 'client_viewer', clientId: IDS.clientA1 }, NOW)).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('listTeam', () => {
  it('shows admins every member and pending invitation; AMs only their clients’ client roles', async () => {
    await seedUser(dbs.owner, 'c1', 'c1@e.co');
    await seedUser(dbs.owner, 'c2', 'c2@e.co');
    await dbs.service.insert(membership).values([
      { userId: 'c1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, createdBy: 'x' },
      { userId: 'c2', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA2, createdBy: 'x' },
    ]);
    await inviteMember(dbs.service, admin, { email: 'p@e.co', role: 'client_viewer', clientId: IDS.clientA2 }, NOW);
    const full = await listTeam(dbs.service, admin, NOW);
    expect(full.members.map((m) => m.email).sort()).toEqual(['admin@e.co', 'am@e.co', 'c1@e.co', 'c2@e.co']);
    expect(full.invitations.map((i) => i.email)).toEqual(['p@e.co']);
    const scoped = await listTeam(dbs.service, am, NOW);
    expect(scoped.members.map((m) => m.email)).toEqual(['c1@e.co']);
    expect(scoped.invitations).toEqual([]);
  });
});

describe('revokeMembership', () => {
  it('removes the membership, unlinks the contact and revokes its links', async () => {
    await seedUser(dbs.owner, 'c1', 'c1@e.co');
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'c1@e.co', userId: 'c1' }).returning();
    const [m] = await dbs.service.insert(membership).values({ userId: 'c1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, contactId: c!.id, createdBy: 'x' }).returning();
    await revokeMembership(dbs.service, am, m!.id, NOW);
    expect(await dbs.service.select().from(membership).where(eq(membership.id, m!.id))).toEqual([]);
    const [after] = await dbs.service.select().from(contact).where(eq(contact.id, c!.id));
    expect(after).toMatchObject({ userId: null, active: false });
    expect(after!.linksRevokedBefore?.toISOString()).toBe(NOW.toISOString());
  });

  it('refuses to remove the last agency admin, and AMs cannot remove agency roles', async () => {
    const [adminRow] = await dbs.service.select().from(membership).where(eq(membership.userId, 'admin'));
    await expect(revokeMembership(dbs.service, admin, adminRow!.id, NOW)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(revokeMembership(dbs.service, am, adminRow!.id, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does not see memberships of another agency', async () => {
    await seedUser(dbs.owner, 'b', 'b@e.co');
    const [m] = await dbs.service.insert(membership).values({ userId: 'b', agencyId: IDS.agencyB, role: 'agency_admin', createdBy: 'x' }).returning();
    await expect(revokeMembership(dbs.service, admin, m!.id, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('revokeInvitation', () => {
  it('revokes a pending invitation the caller could have created', async () => {
    const { id } = await inviteMember(dbs.service, am, { email: 'y@e.co', role: 'client_viewer', clientId: IDS.clientA1 }, NOW);
    await revokeInvitation(dbs.service, am, id, NOW);
    const [row] = await dbs.service.select().from(invitation).where(eq(invitation.id, id));
    expect(row!.revokedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cs/tools exec vitest run src/access/memberships.test.ts src/access/team.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement `memberships.ts`**

```ts
import { type AccessContext, createAccessContext, type Feature, FEATURES, isAgencyRole, type Role } from '@cs/core';
import { agency, client, contact, type Db, membership } from '@cs/db';
import { and, asc, eq } from 'drizzle-orm';

export interface MembershipSummary {
  id: string;
  agencyId: string;
  agencyName: string;
  role: Role;
  clientId: string | null;
  clientName: string | null;
  clientScope: string[] | null;
  contactId: string | null;
  createdAt: Date;
}

export async function listMemberships(service: Db, userId: string): Promise<MembershipSummary[]> {
  const rows = await service
    .select({ m: membership, agencyName: agency.name, clientName: client.name })
    .from(membership)
    .innerJoin(agency, eq(agency.id, membership.agencyId))
    .leftJoin(client, eq(client.id, membership.clientId))
    .where(eq(membership.userId, userId))
    .orderBy(asc(membership.createdAt), asc(membership.id));
  return rows.map(({ m, agencyName, clientName }) => ({
    id: m.id, agencyId: m.agencyId, agencyName, role: m.role as Role, clientId: m.clientId, clientName: clientName ?? null,
    clientScope: m.clientScope ?? null, contactId: m.contactId, createdAt: m.createdAt,
  }));
}

/** Decision 4: the cookie's membership when it is one of the user's own, else the oldest. */
export function pickMembership(list: MembershipSummary[], wantedId: string | undefined): MembershipSummary | null {
  return list.find((m) => m.id === wantedId) ?? list[0] ?? null;
}

const knownFeatures = (raw: unknown): Feature[] =>
  Array.isArray(raw) ? raw.filter((f): f is Feature => (FEATURES as readonly string[]).includes(f as string)) : [];

async function clientFeatures(service: Db, clientId: string): Promise<Feature[]> {
  const [row] = await service.select({ features: client.features }).from(client).where(eq(client.id, clientId));
  return knownFeatures(row?.features);
}

/** Decision 3. Rebuilt on every request so a revoked membership or changed flag applies at once. */
export async function accessContextFor(service: Db, userId: string, m: MembershipSummary): Promise<AccessContext> {
  if (isAgencyRole(m.role)) {
    return createAccessContext({ agencyId: m.agencyId, userId, role: m.role, clientScope: m.role === 'account_manager' && m.clientScope ? m.clientScope : 'all', features: [] });
  }
  return createAccessContext({ agencyId: m.agencyId, userId, role: m.role, clientScope: [m.clientId!], features: await clientFeatures(service, m.clientId!) });
}

export interface GuestSessionClaims {
  contactId: string;
  agencyId: string;
  clientId: string;
  /** Seconds since epoch when the guest cookie was issued. */
  iat: number;
}

/** Decision 6: read-only access for a client contact who opened a signed email link; null when it must be refused. */
export async function guestAccessFor(service: Db, g: GuestSessionClaims): Promise<AccessContext | null> {
  const [c] = await service.select().from(contact).where(and(eq(contact.id, g.contactId), eq(contact.agencyId, g.agencyId)));
  if (!c || !c.active || c.clientId === null || c.clientId !== g.clientId) return null;
  if (c.linksRevokedBefore && g.iat * 1000 < c.linksRevokedBefore.getTime()) return null;
  return createAccessContext({ agencyId: g.agencyId, userId: `contact:${c.id}`, role: 'client_viewer', clientScope: [g.clientId], features: await clientFeatures(service, g.clientId) });
}
```

- [ ] **Step 4: Implement `team.ts`**

```ts
import { type AccessContext, canAccessClient, isAgencyRole, type Role, ToolError } from '@cs/core';
import { client, contact, type Db, invitation, membership } from '@cs/db';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { createInvitation, type NewInvitation } from './invitations';

export interface TeamMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  clientId: string | null;
  clientName: string | null;
  clientScope: string[] | null;
}
export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  clientId: string | null;
  clientName: string | null;
  expiresAt: Date;
}

const isAdmin = (ctx: AccessContext) => ctx.role === 'agency_admin';

/** Decision 11: admins manage everyone; account managers manage client roles of clients they cover. */
function canManage(ctx: AccessContext, role: Role, clientId: string | null): boolean {
  if (isAdmin(ctx)) return true;
  if (ctx.role !== 'account_manager') return false;
  return !isAgencyRole(role) && clientId !== null && canAccessClient(ctx, clientId);
}

export async function listTeam(service: Db, ctx: AccessContext, now = new Date()): Promise<{ members: TeamMember[]; invitations: PendingInvite[] }> {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles manage the team');
  const rows = await service.execute<{ id: string; user_id: string; email: string; name: string; role: Role; client_id: string | null; client_name: string | null; client_scope: string[] | null }>(sql`
    select m.id, m.user_id, u.email, u.name, m.role, m.client_id, c.name as client_name, m.client_scope
    from membership m join auth."user" u on u.id = m.user_id left join client c on c.id = m.client_id
    where m.agency_id = ${ctx.agencyId} order by m.created_at, m.id`);
  const members = [...rows]
    .map((r) => ({ membershipId: r.id, userId: r.user_id, email: r.email, name: r.name, role: r.role, clientId: r.client_id, clientName: r.client_name, clientScope: r.client_scope }))
    .filter((m) => canManage(ctx, m.role, m.clientId));
  const invites = await service
    .select({ i: invitation, clientName: client.name })
    .from(invitation)
    .leftJoin(client, eq(client.id, invitation.clientId))
    .where(and(eq(invitation.agencyId, ctx.agencyId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, now)))
    .orderBy(asc(invitation.createdAt));
  return {
    members,
    invitations: invites
      .filter(({ i }) => canManage(ctx, i.role as Role, i.clientId))
      .map(({ i, clientName }) => ({ id: i.id, email: i.email, role: i.role as Role, clientId: i.clientId, clientName: clientName ?? null, expiresAt: i.expiresAt })),
  };
}

export async function inviteMember(service: Db, ctx: AccessContext, input: Omit<NewInvitation, 'agencyId' | 'invitedBy'>, now = new Date()): Promise<{ id: string; expiresAt: Date }> {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles invite people');
  if (!isAdmin(ctx) && isAgencyRole(input.role)) throw new ToolError('permission_denied', 'Only agency admins invite agency staff');
  if (input.clientId && !canAccessClient(ctx, input.clientId)) throw new ToolError('not_found', 'Client not found');
  return createInvitation(service, { ...input, agencyId: ctx.agencyId, invitedBy: ctx.userId }, now);
}

export async function revokeMembership(service: Db, ctx: AccessContext, membershipId: string, now = new Date()): Promise<void> {
  await service.transaction(async (tx) => {
    const [m] = await tx.select().from(membership).where(and(eq(membership.id, membershipId), eq(membership.agencyId, ctx.agencyId))).for('update');
    if (!m || !canManage(ctx, m.role as Role, m.clientId)) throw new ToolError('not_found', 'Member not found');
    if (m.role === 'agency_admin') {
      const admins = await tx.select({ id: membership.id }).from(membership).where(and(eq(membership.agencyId, ctx.agencyId), eq(membership.role, 'agency_admin'))).for('update');
      if (admins.length <= 1) throw new ToolError('invalid_input', 'An agency needs at least one admin');
    }
    await tx.delete(membership).where(eq(membership.id, m.id));
    if (m.contactId) {
      await tx.update(contact).set({ userId: null, active: false, linksRevokedBefore: now }).where(eq(contact.id, m.contactId));
    }
  });
}

export async function revokeInvitation(service: Db, ctx: AccessContext, invitationId: string, now = new Date()): Promise<void> {
  const [i] = await service.select().from(invitation).where(and(eq(invitation.id, invitationId), eq(invitation.agencyId, ctx.agencyId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt)));
  if (!i || !canManage(ctx, i.role as Role, i.clientId)) throw new ToolError('not_found', 'Invitation not found');
  await service.update(invitation).set({ revokedAt: now }).where(eq(invitation.id, i.id));
}
```

Append to `src/index.ts`: `export * from './access/memberships';` and `export * from './access/team';`.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cs/tools exec vitest run src/access`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): membership access contexts, guest access and team management"
```

---

### Task 4: Tool registry wiring and the 5a read tools

**Files:**
- Create: `packages/tools/src/registry.ts`, `src/tools/schemas.ts`, `src/tools/clients.ts`, `src/tools/briefs.ts`, `src/tools/alerts.ts`, `src/tools/reports.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/src/tools/read-tools.test.ts`

**Interfaces:**
- Consumes: `ToolRegistry`, `toolkit`, `ToolError`, `AccessContext`, `canAccessClient`, `isAgencyRole` (`@cs/core`); `createAuditSink`, `withTenant` (`@cs/db`); `getBrief`, `getAlert` (`@cs/engine`).
- Produces:
  - `interface ToolDeps { app: Db; service: Db }`
  - `createToolRegistry(deps: ToolDeps, opts?: { audit?: AuditSink }): ToolRegistry<ToolDeps>` (audit defaults to `createAuditSink(deps.service)`)
  - Tools: `list_clients` (`{}` → `{ items: ClientSummary[] }`), `get_client_profile` (`{ clientId }` → `ClientProfile`), `list_briefs` (`{ clientId, limit? }` → `{ items: BriefSummary[] }`), `get_brief` (`{ briefId }` → `BriefDetail`), `list_alerts` (`{ clientId, limit? }` → `{ items: AlertSummary[] }`), `get_alert` (`{ alertId }` → `AlertDetail`), `list_trend_reports` (`{ clientId }` → `{ items: ReportSummary[] }`), `get_trend_report` (`{ reportId }` → `ReportDetail`)
  - Exported Zod schemas + inferred types: `ClientSummary`, `ClientProfile`, `BriefSummary`, `BriefDetail`, `BriefItemView`, `AlertSummary`, `AlertDetail`, `ReportSummary`, `ReportDetail`

- [ ] **Step 1: Write the schemas**

`packages/tools/src/tools/schemas.ts`:

```ts
import { z } from 'zod';

const iso = z.string();
const uuid = z.string().uuid();

export const ClientSummary = z.object({ id: uuid, name: z.string(), verticalId: z.string(), timezone: z.string() });
export type ClientSummary = z.infer<typeof ClientSummary>;

export const ClientProfile = ClientSummary.extend({
  services: z.array(z.string()),
  keywords: z.array(z.string()),
  features: z.array(z.string()),
  /** Agency roles only (decision 10); null for client roles. */
  alertMode: z.enum(['direct', 'after_am_check', 'digest_only']).nullable(),
  briefAutoSend: z.boolean().nullable(),
});
export type ClientProfile = z.infer<typeof ClientProfile>;

export const BriefSummary = z.object({
  id: uuid, clientId: uuid, deliveryDate: z.string(), status: z.string(), kind: z.string(), summary: z.string(), sentAt: iso.nullable(), hasPdf: z.boolean(),
});
export type BriefSummary = z.infer<typeof BriefSummary>;

export const BriefItemView = z.object({
  id: uuid, ord: z.number().int(), competitorId: uuid, competitorName: z.string(), headline: z.string(), whatChanged: z.string(), whyItMatters: z.string(),
  recommendedAction: z.string(), confidence: z.number(), effort: z.string(), impact: z.string(), evidenceIds: z.array(z.string()), status: z.string(),
  /** Agency-only (spec §8.5): always null for client roles. */
  upsellTag: z.string().nullable(),
});
export type BriefItemView = z.infer<typeof BriefItemView>;

export const BriefDetail = BriefSummary.extend({ periodStart: iso, periodEnd: iso, approvedAt: iso.nullable(), items: z.array(BriefItemView) });
export type BriefDetail = z.infer<typeof BriefDetail>;

export const AlertSummary = z.object({
  id: uuid, clientId: uuid, competitorName: z.string(), headline: z.string(), score: z.number(), status: z.string(), createdAt: iso, deliveredAt: iso.nullable(),
});
export type AlertSummary = z.infer<typeof AlertSummary>;

export const AlertDetail = AlertSummary.extend({ body: z.string(), evidenceIds: z.array(z.string()), written: z.string().nullable() });
export type AlertDetail = z.infer<typeof AlertDetail>;

export const ReportSummary = z.object({ id: uuid, clientId: uuid, quarter: z.string(), status: z.string(), sentAt: iso.nullable(), hasPdf: z.boolean() });
export type ReportSummary = z.infer<typeof ReportSummary>;

export const ReportDetail = ReportSummary.extend({ periodStart: iso, periodEnd: iso, data: z.record(z.string(), z.unknown()).nullable() });
export type ReportDetail = z.infer<typeof ReportDetail>;

export const listInput = (max: number) => z.object({ clientId: uuid, limit: z.number().int().min(1).max(max).default(Math.min(20, max)) });
export const toIso = (d: Date | null) => (d ? d.toISOString() : null);
```

- [ ] **Step 2: Write the failing tests**

`packages/tools/src/tools/read-tools.test.ts` — seed with the owner connection (tenancy fixture plus one brief, one alert, one report per client), then call through the registry:

```ts
import { type AccessContext, type AuditEvent, createAccessContext } from '@cs/core';
import { alert, brief, briefItem, changeEvent, trendReport } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const audit: AuditEvent[] = [];
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async (e) => void audit.push(e) } });

const ctx = (role: AccessContext['role'], scope: AccessContext['clientScope'], agencyId: string = IDS.agencyA) =>
  createAccessContext({ agencyId, userId: `u-${role}`, role, clientScope: scope, features: [] });
const admin = ctx('agency_admin', 'all');
const owner = ctx('client_owner', [IDS.clientA1]);
const otherAgency = ctx('agency_admin', 'all', IDS.agencyB);

const ids = { readyBrief: '', sentBrief: '', pendingAlert: '', deliveredAlert: '', readyReport: '', sentReport: '' };

beforeEach(async () => {
  audit.length = 0;
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1 };
  const period = { periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z') };
  const [ready] = await dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: '2026-10-12', status: 'ready', summary: 'Draft' }).returning();
  const [sent] = await dbs.owner.insert(brief).values({ ...base, ...period, deliveryDate: '2026-10-05', status: 'sent', summary: 'Sent', sentAt: new Date('2026-10-05T12:00:00Z') }).returning();
  await dbs.owner.insert(briefItem).values({
    ...base, briefId: sent!.id, ord: 1, competitorId: IDS.competitorX, headline: 'Smith cut prices', whatChanged: 'w', whyItMatters: 'y',
    recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', upsellTag: 'ppc_audit',
  });
  const [ev] = await dbs.owner.insert(changeEvent).values({ competitorId: IDS.competitorX, changeType: 'price_change', summary: 's', confidence: 0.9, occurredAt: new Date('2026-10-03T00:00:00Z') }).returning();
  const alertBase = { ...base, competitorId: IDS.competitorX, eventId: ev!.id, score: 80, headline: 'H', body: 'B', mode: 'after_am_check' };
  const [pending] = await dbs.owner.insert(alert).values({ ...alertBase, status: 'pending_review' }).returning();
  const [delivered] = await dbs.owner.insert(alert).values({ ...alertBase, status: 'delivered', deliveredAt: new Date('2026-10-04T10:00:00Z') }).returning();
  const rp = { ...base, periodStart: new Date('2026-07-01T00:00:00Z'), periodEnd: new Date('2026-09-30T00:00:00Z') };
  const [rr] = await dbs.owner.insert(trendReport).values({ ...rp, quarter: '2026-Q2', status: 'ready' }).returning();
  const [rs] = await dbs.owner.insert(trendReport).values({ ...rp, quarter: '2026-Q3', status: 'sent', sentAt: new Date('2026-10-02T08:00:00Z'), data: { quarter: '2026-Q3' } }).returning();
  Object.assign(ids, { readyBrief: ready!.id, sentBrief: sent!.id, pendingAlert: pending!.id, deliveredAlert: delivered!.id, readyReport: rr!.id, sentReport: rs!.id });
});

describe('clients', () => {
  it('list_clients is agency-only and tenant-scoped', async () => {
    const out = (await registry.invoke(admin, 'list_clients', {})) as { items: { name: string }[] };
    expect(out.items.map((c) => c.name).sort()).toEqual(['A1 HVAC', 'A2 Dental']);
    await expect(registry.invoke(owner, 'list_clients', {})).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('get_client_profile hides agency fields from clients and refuses other tenants', async () => {
    const asOwner = (await registry.invoke(owner, 'get_client_profile', { clientId: IDS.clientA1 })) as { alertMode: unknown };
    expect(asOwner.alertMode).toBeNull();
    const asAdmin = (await registry.invoke(admin, 'get_client_profile', { clientId: IDS.clientA1 })) as { alertMode: unknown };
    expect(asAdmin.alertMode).toBe('after_am_check');
    await expect(registry.invoke(owner, 'get_client_profile', { clientId: IDS.clientA2 })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'get_client_profile', { clientId: IDS.clientA1 })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('briefs', () => {
  it('list_briefs shows clients only approved/sent briefs, agencies all', async () => {
    const forOwner = (await registry.invoke(owner, 'list_briefs', { clientId: IDS.clientA1 })) as { items: { id: string }[] };
    expect(forOwner.items.map((b) => b.id)).toEqual([ids.sentBrief]);
    const forAdmin = (await registry.invoke(admin, 'list_briefs', { clientId: IDS.clientA1 })) as { items: { id: string }[] };
    expect(forAdmin.items.map((b) => b.id)).toEqual([ids.readyBrief, ids.sentBrief]);
  });

  it('get_brief strips upsell_tag for clients and hides drafts', async () => {
    const forOwner = (await registry.invoke(owner, 'get_brief', { briefId: ids.sentBrief })) as { items: { upsellTag: unknown; competitorName: string }[] };
    expect(forOwner.items[0]).toMatchObject({ upsellTag: null, competitorName: 'Smith HVAC' });
    const forAdmin = (await registry.invoke(admin, 'get_brief', { briefId: ids.sentBrief })) as { items: { upsellTag: unknown }[] };
    expect(forAdmin.items[0]!.upsellTag).toBe('ppc_audit');
    await expect(registry.invoke(owner, 'get_brief', { briefId: ids.readyBrief })).rejects.toMatchObject({ code: 'not_found' });
    await expect(registry.invoke(otherAgency, 'get_brief', { briefId: ids.sentBrief })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('alerts', () => {
  it('clients see delivered alerts only', async () => {
    const forOwner = (await registry.invoke(owner, 'list_alerts', { clientId: IDS.clientA1 })) as { items: { id: string }[] };
    expect(forOwner.items.map((a) => a.id)).toEqual([ids.deliveredAlert]);
    await expect(registry.invoke(owner, 'get_alert', { alertId: ids.pendingAlert })).rejects.toMatchObject({ code: 'not_found' });
    const forAdmin = (await registry.invoke(admin, 'list_alerts', { clientId: IDS.clientA1 })) as { items: unknown[] };
    expect(forAdmin.items).toHaveLength(2);
  });
});

describe('trend reports', () => {
  it('clients see sent reports only', async () => {
    const forOwner = (await registry.invoke(owner, 'list_trend_reports', { clientId: IDS.clientA1 })) as { items: { id: string }[] };
    expect(forOwner.items.map((r) => r.id)).toEqual([ids.sentReport]);
    await expect(registry.invoke(owner, 'get_trend_report', { reportId: ids.readyReport })).rejects.toMatchObject({ code: 'not_found' });
    const detail = (await registry.invoke(admin, 'get_trend_report', { reportId: ids.sentReport })) as { quarter: string; data: unknown };
    expect(detail).toMatchObject({ quarter: '2026-Q3', data: { quarter: '2026-Q3' } });
  });
});

it('audits every call, including refusals', async () => {
  await registry.invoke(admin, 'list_clients', {});
  await registry.invoke(owner, 'list_clients', {}).catch(() => {});
  expect(audit.map((a) => [a.tool, a.outcome])).toEqual([['list_clients', 'ok'], ['list_clients', 'permission_denied']]);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @cs/tools exec vitest run src/tools/read-tools.test.ts` — Expected: FAIL (registry missing).

- [ ] **Step 4: Implement the registry and tools**

`packages/tools/src/registry.ts`:

```ts
import { type AuditSink, ToolRegistry } from '@cs/core';
import { createAuditSink, type Db } from '@cs/db';
import { alertTools } from './tools/alerts';
import { briefTools } from './tools/briefs';
import { clientTools } from './tools/clients';
import { reportTools } from './tools/reports';

export interface ToolDeps {
  /** app_user connection: tenant reads go through withTenant + RLS. */
  app: Db;
  /** Service role: audit, and engine functions that need it. */
  service: Db;
}

export function createToolRegistry(deps: ToolDeps, opts: { audit?: AuditSink } = {}): ToolRegistry<ToolDeps> {
  return new ToolRegistry<ToolDeps>(deps, opts.audit ?? createAuditSink(deps.service)).register(...clientTools, ...briefTools, ...alertTools, ...reportTools);
}
```

`packages/tools/src/tools/clients.ts`:

```ts
import { canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { client, withTenant } from '@cs/db';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';
import { ClientProfile, ClientSummary } from './schemas';

const { defineTool } = toolkit<ToolDeps>();

export const listClients = defineTool({
  name: 'list_clients',
  description: 'List the client businesses this agency user can see.',
  input: z.object({}),
  output: z.object({ items: z.array(ClientSummary) }),
  permission: 'agency',
  async handler(ctx, _input, deps) {
    const rows = await withTenant(deps.app, ctx, (tx) => tx.select().from(client).orderBy(asc(client.name)));
    return { items: rows.map((c) => ({ id: c.id, name: c.name, verticalId: c.verticalId, timezone: c.timezone })) };
  },
});

export const getClientProfile = defineTool({
  name: 'get_client_profile',
  description: 'Get one client business: services, keywords, features and (agency roles) delivery settings.',
  input: z.object({ clientId: z.string().uuid() }),
  output: ClientProfile,
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select().from(client).where(eq(client.id, clientId)));
    if (!c) throw new ToolError('not_found', 'Client not found');
    const agency = isAgencyRole(ctx.role);
    return {
      id: c.id, name: c.name, verticalId: c.verticalId, timezone: c.timezone, services: c.services, keywords: c.keywords, features: c.features,
      alertMode: agency ? (c.alertMode as ClientProfile['alertMode']) : null, briefAutoSend: agency ? c.briefAutoSend : null,
    };
  },
});

export const clientTools = [listClients, getClientProfile];
```

`packages/tools/src/tools/briefs.ts`:

```ts
import { canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { brief, competitor, withTenant } from '@cs/db';
import { getBrief } from '@cs/engine';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';
import { BriefDetail, BriefSummary, listInput, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const CLIENT_VISIBLE = ['approved', 'sent'];

const summary = (b: typeof brief.$inferSelect): BriefSummary => ({
  id: b.id, clientId: b.clientId, deliveryDate: b.deliveryDate, status: b.status, kind: b.kind, summary: b.summary, sentAt: toIso(b.sentAt), hasPdf: b.pdfKey !== null,
});

export const listBriefs = defineTool({
  name: 'list_briefs',
  description: 'List weekly briefs for a client, newest delivery date first.',
  input: listInput(52),
  output: z.object({ items: z.array(BriefSummary) }),
  permission: 'read',
  async handler(ctx, { clientId, limit }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const where = isAgencyRole(ctx.role) ? eq(brief.clientId, clientId) : and(eq(brief.clientId, clientId), inArray(brief.status, CLIENT_VISIBLE));
    const rows = await withTenant(deps.app, ctx, (tx) => tx.select().from(brief).where(where).orderBy(desc(brief.deliveryDate)).limit(limit));
    return { items: rows.map(summary) };
  },
});

export const getBriefTool = defineTool({
  name: 'get_brief',
  description: 'Get one weekly brief with its items. Client roles see approved or sent briefs only, without agency-only tags.',
  input: z.object({ briefId: z.string().uuid() }),
  output: BriefDetail,
  permission: 'read',
  async handler(ctx, { briefId }, deps) {
    const view = await getBrief({ app: deps.app }, ctx, briefId); // 4a: visibility, status gate and upsell stripping
    const competitorIds = [...new Set(view.items.map((i) => i.competitorId))];
    const names = competitorIds.length
      ? await withTenant(deps.app, ctx, (tx) => tx.select({ id: competitor.id, name: competitor.name }).from(competitor).where(inArray(competitor.id, competitorIds)))
      : [];
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    const agency = isAgencyRole(ctx.role);
    return {
      ...summary(view.brief), periodStart: view.brief.periodStart.toISOString(), periodEnd: view.brief.periodEnd.toISOString(), approvedAt: toIso(view.brief.approvedAt),
      items: view.items.map((i) => ({
        id: i.id, ord: i.ord, competitorId: i.competitorId, competitorName: nameOf.get(i.competitorId) ?? 'Competitor', headline: i.headline, whatChanged: i.whatChanged,
        whyItMatters: i.whyItMatters, recommendedAction: i.recommendedAction, confidence: i.confidence, effort: i.effort, impact: i.impact, evidenceIds: i.evidenceIds,
        status: i.status, upsellTag: agency ? i.upsellTag : null,
      })),
    };
  },
});

export const briefTools = [listBriefs, getBriefTool];
```

`packages/tools/src/tools/alerts.ts`:

```ts
import { canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { alert, competitor, withTenant } from '@cs/db';
import { getAlert } from '@cs/engine';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';
import { AlertDetail, AlertSummary, listInput, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();

export const listAlerts = defineTool({
  name: 'list_alerts',
  description: 'List instant alerts for a client, newest first. Client roles see delivered alerts only.',
  input: listInput(100),
  output: z.object({ items: z.array(AlertSummary) }),
  permission: 'read',
  async handler(ctx, { clientId, limit }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const where = isAgencyRole(ctx.role) ? eq(alert.clientId, clientId) : and(eq(alert.clientId, clientId), eq(alert.status, 'delivered'));
    const rows = await withTenant(deps.app, ctx, (tx) =>
      tx.select({ a: alert, competitorName: competitor.name }).from(alert).innerJoin(competitor, eq(competitor.id, alert.competitorId)).where(where).orderBy(desc(alert.createdAt)).limit(limit));
    return {
      items: rows.map(({ a, competitorName }) => ({
        id: a.id, clientId: a.clientId, competitorName, headline: a.headline, score: a.score, status: a.status, createdAt: a.createdAt.toISOString(), deliveredAt: toIso(a.deliveredAt),
      })),
    };
  },
});

export const getAlertTool = defineTool({
  name: 'get_alert',
  description: 'Get one alert with its text and evidence ids.',
  input: z.object({ alertId: z.string().uuid() }),
  output: AlertDetail,
  permission: 'read',
  async handler(ctx, { alertId }, deps) {
    const a = await getAlert({ app: deps.app }, ctx, alertId); // 4b: client roles see delivered only
    const [c] = await withTenant(deps.app, ctx, (tx) => tx.select({ name: competitor.name }).from(competitor).where(eq(competitor.id, a.competitorId)));
    return {
      id: a.id, clientId: a.clientId, competitorName: c?.name ?? 'Competitor', headline: a.headline, body: a.body, score: a.score, status: a.status,
      createdAt: a.createdAt.toISOString(), deliveredAt: toIso(a.deliveredAt), evidenceIds: a.evidenceIds, written: a.written,
    };
  },
});

export const alertTools = [listAlerts, getAlertTool];
```

`packages/tools/src/tools/reports.ts`:

```ts
import { canAccessClient, isAgencyRole, toolkit, ToolError } from '@cs/core';
import { trendReport, withTenant } from '@cs/db';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../registry';
import { ReportDetail, ReportSummary, toIso } from './schemas';

const { defineTool } = toolkit<ToolDeps>();
const summary = (r: typeof trendReport.$inferSelect): ReportSummary => ({ id: r.id, clientId: r.clientId, quarter: r.quarter, status: r.status, sentAt: toIso(r.sentAt), hasPdf: r.pdfKey !== null });

export const listTrendReports = defineTool({
  name: 'list_trend_reports',
  description: 'List quarterly trend reports for a client. Client roles see sent reports only.',
  input: z.object({ clientId: z.string().uuid() }),
  output: z.object({ items: z.array(ReportSummary) }),
  permission: 'read',
  async handler(ctx, { clientId }, deps) {
    if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
    const where = isAgencyRole(ctx.role) ? eq(trendReport.clientId, clientId) : and(eq(trendReport.clientId, clientId), eq(trendReport.status, 'sent'));
    const rows = await withTenant(deps.app, ctx, (tx) => tx.select().from(trendReport).where(where).orderBy(desc(trendReport.quarter)));
    return { items: rows.map(summary) };
  },
});

export const getTrendReport = defineTool({
  name: 'get_trend_report',
  description: 'Get one quarterly trend report (deterministic numbers, never model-written).',
  input: z.object({ reportId: z.string().uuid() }),
  output: ReportDetail,
  permission: 'read',
  async handler(ctx, { reportId }, deps) {
    const [r] = await withTenant(deps.app, ctx, (tx) => tx.select().from(trendReport).where(eq(trendReport.id, reportId)));
    if (!r || !canAccessClient(ctx, r.clientId) || (!isAgencyRole(ctx.role) && r.status !== 'sent')) throw new ToolError('not_found', 'Report not found');
    return { ...summary(r), periodStart: r.periodStart.toISOString(), periodEnd: r.periodEnd.toISOString(), data: (r.data as Record<string, unknown> | null) ?? null };
  },
});

export const reportTools = [listTrendReports, getTrendReport];
```

Append to `src/index.ts`: `export * from './registry';` and `export * from './tools/schemas';`.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cs/tools exec vitest run src/tools` and `pnpm --filter @cs/tools typecheck` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): tool registry with client, brief, alert and trend-report read tools"
```

---

### Task 5: Inbox and personal notification preferences

**Files:**
- Create: `packages/tools/src/inbox.ts`, `packages/tools/src/preferences.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/src/inbox.test.ts`, `packages/tools/src/preferences.test.ts`

**Interfaces:**
- Consumes: `notification`, `contact`, `notificationPref`, `CLIENT_KINDS`, `AGENCY_KINDS`, `QuietHours` (`@cs/db`); `setNotificationPref`, `PERSONAL_CHANNELS`, `PersonalChannel`, `parseHhmm`, `safeTimezone` (`@cs/engine`).
- Produces:
  - `type InboxOwner = { userId: string } | { contactId: string }` — a signed-in user, or a guest's single contact
  - `interface InboxItem { id: string; kind: string; title: string; body: string; link: string | null; clientId: string; createdAt: Date; readAt: Date | null }`
  - `listInbox(service: Db, owner: InboxOwner, opts?: { limit?: number; unreadOnly?: boolean }): Promise<InboxItem[]>`
  - `unreadCount(service: Db, owner: InboxOwner): Promise<number>`
  - `markRead(service: Db, owner: InboxOwner, notificationId: string, now?: Date): Promise<void>`
  - `markAllRead(service: Db, owner: InboxOwner, now?: Date): Promise<number>`
  - `interface MyContactSettings { contactId: string; agencyName: string; clientName: string | null; email: string; timezone: string | null; quietHours: QuietHours | null; kinds: { kind: string; channels: Record<PersonalChannel, boolean> }[] }`
  - `myNotificationSettings(service: Db, userId: string): Promise<MyContactSettings[]>`
  - `setMyNotificationPref(service: Db, userId: string, input: { contactId: string; kind: NotificationKind; channel: PersonalChannel; enabled: boolean }): Promise<void>`
  - `updateMyContact(service: Db, userId: string, input: { contactId: string; timezone?: string | null; quietHours?: QuietHours | null }): Promise<void>`

Inbox rows are `notification` rows with `channel = 'in_app'` whose `contact_id` is one of the owner's contacts (`contact.user_id = userId`, or the guest's single contact id). The in-app `link` already holds a signed `/l/` URL for that contact (4b `notify`); the inbox page opens it as-is.

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/inbox.test.ts`:

```ts
import { contact, notification } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { listInbox, markAllRead, markRead, unreadCount } from './inbox';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let mine = '';
let theirs = '';

async function note(contactId: string, n: number, channel = 'in_app') {
  await dbs.service.insert(notification).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, contactId, channel, kind: 'alert', subjectType: 'alert', subjectId: IDS.clientA1,
    dedupeKey: `k${n}:${contactId}:${channel}`, title: `T${n}`, body: 'b', status: 'sent', createdAt: new Date(Date.UTC(2026, 9, n)),
  });
}

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [a] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'me@e.co', userId: 'u1' }).returning();
  const [b] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'you@e.co', userId: 'u2' }).returning();
  mine = a!.id;
  theirs = b!.id;
  await note(mine, 1);
  await note(mine, 2);
  await note(mine, 3, 'email');
  await note(theirs, 4);
});

describe('inbox', () => {
  it('lists only the owner’s in-app notifications, newest first', async () => {
    expect((await listInbox(dbs.service, { userId: 'u1' })).map((i) => i.title)).toEqual(['T2', 'T1']);
    expect((await listInbox(dbs.service, { contactId: theirs })).map((i) => i.title)).toEqual(['T4']);
    expect(await unreadCount(dbs.service, { userId: 'u1' })).toBe(2);
  });

  it('marks one or all read, never another person’s', async () => {
    const [first] = await listInbox(dbs.service, { userId: 'u1' });
    const [other] = await listInbox(dbs.service, { userId: 'u2' });
    await markRead(dbs.service, { userId: 'u1' }, other!.id);
    expect(await unreadCount(dbs.service, { userId: 'u2' })).toBe(1);
    await markRead(dbs.service, { userId: 'u1' }, first!.id);
    expect(await unreadCount(dbs.service, { userId: 'u1' })).toBe(1);
    expect(await markAllRead(dbs.service, { userId: 'u1' })).toBe(1);
    expect(await listInbox(dbs.service, { userId: 'u1' }, { unreadOnly: true })).toEqual([]);
  });
});
```

`packages/tools/src/preferences.test.ts`:

```ts
import { contact, notificationPref } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { myNotificationSettings, setMyNotificationPref, updateMyContact } from './preferences';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
let clientContact = '';
let agencyContact = '';
let someoneElse = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const rows = await dbs.service.insert(contact).values([
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'me@e.co', userId: 'u1' },
    { agencyId: IDS.agencyA, role: 'account_manager', email: 'me@e.co', userId: 'u1' },
    { agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_viewer', email: 'x@e.co', userId: 'u2' },
  ]).returning();
  [clientContact, agencyContact, someoneElse] = rows.map((r) => r.id) as [string, string, string];
});

describe('myNotificationSettings', () => {
  it('lists each of my contacts with the kinds of its audience, defaulting to on', async () => {
    await setMyNotificationPref(dbs.service, 'u1', { contactId: clientContact, kind: 'alert', channel: 'email', enabled: false });
    const s = await myNotificationSettings(dbs.service, 'u1');
    const c = s.find((x) => x.contactId === clientContact)!;
    expect(c.clientName).toBe('A1 HVAC');
    expect(c.kinds.map((k) => k.kind)).toEqual(['alert', 'alert_digest', 'brief', 'trend_report']);
    expect(c.kinds[0]!.channels).toEqual({ in_app: true, email: false });
    const a = s.find((x) => x.contactId === agencyContact)!;
    expect(a.kinds.map((k) => k.kind)).toEqual(['am_alert', 'brief_ready', 'brief_failed', 'brief_overdue', 'trend_report']);
  });
});

describe('setMyNotificationPref / updateMyContact', () => {
  it('refuses another person’s contact and kinds outside the contact’s audience', async () => {
    await expect(setMyNotificationPref(dbs.service, 'u1', { contactId: someoneElse, kind: 'alert', channel: 'email', enabled: false })).rejects.toMatchObject({ code: 'not_found' });
    await expect(setMyNotificationPref(dbs.service, 'u1', { contactId: clientContact, kind: 'am_alert', channel: 'email', enabled: false })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(await dbs.service.select().from(notificationPref)).toEqual([]);
  });

  it('validates timezone and quiet hours', async () => {
    await updateMyContact(dbs.service, 'u1', { contactId: clientContact, timezone: 'America/Denver', quietHours: { start: '21:00', end: '07:00' } });
    const [row] = await dbs.service.select().from(contact).where(eq(contact.id, clientContact));
    expect(row).toMatchObject({ timezone: 'America/Denver', quietHours: { start: '21:00', end: '07:00' } });
    await expect(updateMyContact(dbs.service, 'u1', { contactId: clientContact, timezone: 'Mars/Base' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(updateMyContact(dbs.service, 'u1', { contactId: clientContact, quietHours: { start: '25:00', end: '07:00' } })).rejects.toMatchObject({ code: 'invalid_input' });
    await updateMyContact(dbs.service, 'u1', { contactId: clientContact, timezone: '', quietHours: null });
    const [cleared] = await dbs.service.select().from(contact).where(eq(contact.id, clientContact));
    expect(cleared).toMatchObject({ timezone: null, quietHours: null });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/tools exec vitest run src/inbox.test.ts src/preferences.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`packages/tools/src/inbox.ts`:

```ts
import { contact, type Db, notification } from '@cs/db';
import { and, count, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

export type InboxOwner = { userId: string } | { contactId: string };
export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  clientId: string;
  createdAt: Date;
  readAt: Date | null;
}

async function ownerContacts(service: Db, owner: InboxOwner): Promise<string[]> {
  if ('contactId' in owner) return [owner.contactId];
  const rows = await service.select({ id: contact.id }).from(contact).where(eq(contact.userId, owner.userId));
  return rows.map((r) => r.id);
}

async function scope(service: Db, owner: InboxOwner, extra?: SQL): Promise<SQL | null> {
  const ids = await ownerContacts(service, owner);
  if (ids.length === 0) return null;
  return and(inArray(notification.contactId, ids), eq(notification.channel, 'in_app'), extra) ?? null;
}

export async function listInbox(service: Db, owner: InboxOwner, opts: { limit?: number; unreadOnly?: boolean } = {}): Promise<InboxItem[]> {
  const where = await scope(service, owner, opts.unreadOnly ? isNull(notification.readAt) : undefined);
  if (!where) return [];
  const rows = await service.select().from(notification).where(where).orderBy(desc(notification.createdAt)).limit(Math.min(opts.limit ?? 50, 200));
  return rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, clientId: n.clientId, createdAt: n.createdAt, readAt: n.readAt }));
}

export async function unreadCount(service: Db, owner: InboxOwner): Promise<number> {
  const where = await scope(service, owner, isNull(notification.readAt));
  if (!where) return 0;
  const [row] = await service.select({ n: count() }).from(notification).where(where);
  return row?.n ?? 0;
}

export async function markRead(service: Db, owner: InboxOwner, notificationId: string, now = new Date()): Promise<void> {
  const where = await scope(service, owner, and(eq(notification.id, notificationId), isNull(notification.readAt)));
  if (where) await service.update(notification).set({ readAt: now }).where(where);
}

export async function markAllRead(service: Db, owner: InboxOwner, now = new Date()): Promise<number> {
  const where = await scope(service, owner, isNull(notification.readAt));
  if (!where) return 0;
  const rows = await service.update(notification).set({ readAt: now }).where(where).returning({ id: notification.id });
  return rows.length;
}
```

`packages/tools/src/preferences.ts`:

```ts
import { ToolError } from '@cs/core';
import { agency, AGENCY_KINDS, client, CLIENT_KINDS, contact, type Db, type NotificationKind, notificationPref, type QuietHours } from '@cs/db';
import { parseHhmm, PERSONAL_CHANNELS, type PersonalChannel, setNotificationPref } from '@cs/engine';
import { and, asc, eq } from 'drizzle-orm';

export interface MyContactSettings {
  contactId: string;
  agencyName: string;
  clientName: string | null;
  email: string;
  timezone: string | null;
  quietHours: QuietHours | null;
  kinds: { kind: string; channels: Record<PersonalChannel, boolean> }[];
}

const kindsFor = (clientId: string | null): readonly string[] => (clientId ? CLIENT_KINDS : AGENCY_KINDS);

async function myContact(service: Db, userId: string, contactId: string) {
  const [c] = await service.select().from(contact).where(and(eq(contact.id, contactId), eq(contact.userId, userId)));
  if (!c) throw new ToolError('not_found', 'Contact not found');
  return c;
}

export async function myNotificationSettings(service: Db, userId: string): Promise<MyContactSettings[]> {
  const rows = await service
    .select({ c: contact, agencyName: agency.name, clientName: client.name })
    .from(contact)
    .innerJoin(agency, eq(agency.id, contact.agencyId))
    .leftJoin(client, eq(client.id, contact.clientId))
    .where(and(eq(contact.userId, userId), eq(contact.active, true)))
    .orderBy(asc(agency.name), asc(client.name));
  const out: MyContactSettings[] = [];
  for (const { c, agencyName, clientName } of rows) {
    const prefs = await service.select().from(notificationPref).where(eq(notificationPref.contactId, c.id));
    const on = (kind: string, channel: string) => prefs.find((p) => p.kind === kind && p.channel === channel)?.enabled ?? true;
    out.push({
      contactId: c.id, agencyName, clientName: clientName ?? null, email: c.email, timezone: c.timezone, quietHours: c.quietHours ?? null,
      kinds: kindsFor(c.clientId).map((kind) => ({ kind, channels: Object.fromEntries(PERSONAL_CHANNELS.map((ch) => [ch, on(kind, ch)])) as Record<PersonalChannel, boolean> })),
    });
  }
  return out;
}

export async function setMyNotificationPref(service: Db, userId: string, input: { contactId: string; kind: NotificationKind; channel: PersonalChannel; enabled: boolean }): Promise<void> {
  const c = await myContact(service, userId, input.contactId);
  if (!kindsFor(c.clientId).includes(input.kind)) throw new ToolError('invalid_input', `${input.kind} does not apply to this contact`);
  if (!(PERSONAL_CHANNELS as readonly string[]).includes(input.channel)) throw new ToolError('invalid_input', 'Unknown channel');
  await setNotificationPref(service, input);
}

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export async function updateMyContact(service: Db, userId: string, input: { contactId: string; timezone?: string | null; quietHours?: QuietHours | null }): Promise<void> {
  await myContact(service, userId, input.contactId);
  const patch: Partial<typeof contact.$inferInsert> = {};
  if (input.timezone !== undefined) {
    const tz = input.timezone?.trim() || null; // '' → NULL (4b final review M-b)
    if (tz && !validZone(tz)) throw new ToolError('invalid_input', 'Unknown time zone');
    patch.timezone = tz;
  }
  if (input.quietHours !== undefined) {
    const q = input.quietHours;
    if (q && (parseHhmm(q.start) === null || parseHhmm(q.end) === null)) throw new ToolError('invalid_input', 'Quiet hours must be HH:MM');
    patch.quietHours = q;
  }
  if (Object.keys(patch).length > 0) await service.update(contact).set(patch).where(eq(contact.id, input.contactId));
}
```

Check `setNotificationPref`'s own validation in `packages/engine/src/delivery/contacts.ts:85` and that `parseHhmm` is exported from `@cs/engine` (it is in `delivery/time.ts`; confirm `delivery/index.ts` re-exports it — add the export if missing). Append `export * from './inbox';` and `export * from './preferences';` to `src/index.ts`.

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/tools exec vitest run src/inbox.test.ts src/preferences.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tools packages/engine/src/delivery
git commit -m "feat(tools): in-app inbox and personal notification preferences"
```

---

### Task 6: Agency and client delivery settings

**Files:**
- Create: `packages/tools/src/settings.ts`
- Modify: `packages/tools/src/index.ts`
- Test: `packages/tools/src/settings.test.ts`

**Interfaces:**
- Consumes: `addContact`, `addAgencyWebhook`, `updateClientDelivery`, `webhookUrlProblem`, `ALERT_MODES` (`@cs/engine`); `resolveBranding`, `Branding` (`@cs/email`); `agency`, `agencyWebhook`, `client`, `contact`, `AgencyBranding`, `AlertMode` (`@cs/db`).
- Produces:
  - `getAgencyBranding(service: Db, ctx: AccessContext): Promise<{ stored: AgencyBranding; resolved: Branding }>` (any role of that agency — the shell needs it)
  - `brandingProblems(input: AgencyBranding): string[]`
  - `updateAgencyBranding(service: Db, ctx: AccessContext, input: AgencyBranding): Promise<void>` (admin only)
  - `interface WebhookView { id: string; kind: 'slack' | 'teams'; host: string; kinds: string[] | null; active: boolean; createdAt: Date }` (never the full URL — it is a secret)
  - `listWebhooks(service, ctx): Promise<WebhookView[]>`, `addWebhook(service, ctx, input: { kind: 'slack' | 'teams'; url: string; kinds?: string[] | null }): Promise<string>`, `setWebhookActive(service, ctx, id: string, active: boolean): Promise<void>` (admin only)
  - `interface RecipientView { contactId: string; email: string; name: string | null; role: string; active: boolean; hasAccount: boolean }`
  - `listClientRecipients(service, ctx, clientId): Promise<RecipientView[]>`, `addClientRecipient(service, ctx, input: { clientId: string; email: string; name?: string | null; role: 'client_owner' | 'client_viewer' }): Promise<string>`, `deactivateRecipient(service, ctx, contactId: string, now?: Date): Promise<void>` (agency roles with access to the client)
  - `updateClientDeliverySettings(deps: { service: Db; app: Db }, ctx, clientId: string, patch: { alertMode?: AlertMode; briefAutoSend?: boolean; timezone?: string }): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`packages/tools/src/settings.test.ts`:

```ts
import { createAccessContext } from '@cs/core';
import { agency, agencyWebhook, client, contact } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addClientRecipient, addWebhook, brandingProblems, deactivateRecipient, getAgencyBranding, listClientRecipients, listWebhooks,
  setWebhookActive, updateAgencyBranding, updateClientDeliverySettings,
} from './settings';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const mk = (role: 'agency_admin' | 'account_manager' | 'client_owner', scope: 'all' | string[]) =>
  createAccessContext({ agencyId: IDS.agencyA, userId: role, role, clientScope: scope, features: [] });
const admin = mk('agency_admin', 'all');
const am = mk('account_manager', [IDS.clientA1]);
const owner = mk('client_owner', [IDS.clientA1]);
const NOW = new Date('2026-10-05T12:00:00Z');

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('branding', () => {
  it('reports invalid values and stores only trimmed valid ones', async () => {
    expect(brandingProblems({ primary: 'red', logoUrl: 'http://x.co/l.png', displayName: 'x'.repeat(81) })).toHaveLength(3);
    await expect(updateAgencyBranding(dbs.service, admin, { primary: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'invalid_input' });
    await updateAgencyBranding(dbs.service, admin, { displayName: ' Acme Marketing ', primary: '#123ABC', logoUrl: 'https://cdn.acme.co/logo.png', signOff: '' });
    const { stored, resolved } = await getAgencyBranding(dbs.service, am);
    expect(stored).toEqual({ displayName: 'Acme Marketing', primary: '#123ABC', logoUrl: 'https://cdn.acme.co/logo.png' });
    expect(resolved.primary).toBe('#123ABC');
  });

  it('is admin-only to change', async () => {
    await expect(updateAgencyBranding(dbs.service, am, { displayName: 'X' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('webhooks', () => {
  it('adds, lists without the secret URL, and toggles', async () => {
    const id = await addWebhook(dbs.service, admin, { kind: 'slack', url: 'https://hooks.slack.com/services/T/B/secret' });
    const [view] = await listWebhooks(dbs.service, admin);
    expect(view).toMatchObject({ id, kind: 'slack', host: 'hooks.slack.com', active: true });
    expect(JSON.stringify(view)).not.toContain('secret');
    await setWebhookActive(dbs.service, admin, id, false);
    const [row] = await dbs.service.select().from(agencyWebhook).where(eq(agencyWebhook.id, id));
    expect(row!.active).toBe(false);
  });

  it('rejects disallowed URLs and non-admins', async () => {
    await expect(addWebhook(dbs.service, admin, { kind: 'slack', url: 'https://evil.example/hook' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(addWebhook(dbs.service, am, { kind: 'slack', url: 'https://hooks.slack.com/services/T/B/x' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

describe('client recipients', () => {
  it('lets agency roles with access add, list and deactivate recipients', async () => {
    const id = await addClientRecipient(dbs.service, am, { clientId: IDS.clientA1, email: 'Owner@Biz.co', role: 'client_owner' });
    expect((await listClientRecipients(dbs.service, am, IDS.clientA1)).map((r) => r.email)).toEqual(['Owner@Biz.co']);
    await deactivateRecipient(dbs.service, am, id, NOW);
    const [row] = await dbs.service.select().from(contact).where(eq(contact.id, id));
    expect(row).toMatchObject({ active: false });
    expect(row!.linksRevokedBefore?.toISOString()).toBe(NOW.toISOString());
  });

  it('refuses clients out of scope, client roles, and agency contacts', async () => {
    await expect(addClientRecipient(dbs.service, am, { clientId: IDS.clientA2, email: 'x@b.co', role: 'client_owner' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(listClientRecipients(dbs.service, owner, IDS.clientA1)).rejects.toMatchObject({ code: 'permission_denied' });
    const [ag] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'account_manager', email: 'am@e.co' }).returning();
    await expect(deactivateRecipient(dbs.service, am, ag!.id, NOW)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('client delivery', () => {
  it('updates alert mode, auto-send and timezone for agency roles', async () => {
    await updateClientDeliverySettings({ service: dbs.service, app: dbs.app }, am, IDS.clientA1, { alertMode: 'direct', briefAutoSend: true, timezone: 'America/New_York' });
    const [c] = await dbs.service.select().from(client).where(eq(client.id, IDS.clientA1));
    expect(c).toMatchObject({ alertMode: 'direct', briefAutoSend: true, timezone: 'America/New_York' });
    await expect(updateClientDeliverySettings({ service: dbs.service, app: dbs.app }, am, IDS.clientA1, { timezone: 'Nope/Zone' })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(updateClientDeliverySettings({ service: dbs.service, app: dbs.app }, owner, IDS.clientA1, { alertMode: 'direct' })).rejects.toMatchObject({ code: 'permission_denied' });
  });
});

it('getAgencyBranding works for agencies with no stored branding', async () => {
  await dbs.owner.update(agency).set({ branding: null }).where(eq(agency.id, IDS.agencyA));
  const { stored, resolved } = await getAgencyBranding(dbs.service, owner);
  expect(stored).toEqual({});
  expect(resolved.displayName).toBe('Agency A');
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (module missing).

- [ ] **Step 3: Implement**

`packages/tools/src/settings.ts`:

```ts
import { type AccessContext, canAccessClient, isAgencyRole, ToolError } from '@cs/core';
import { agency, type AgencyBranding, agencyWebhook, type AlertMode, client, contact, type Db } from '@cs/db';
import { type Branding, resolveBranding } from '@cs/email';
import { addAgencyWebhook, addContact, ALERT_MODES, updateClientDelivery, webhookUrlProblem } from '@cs/engine';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';

const requireAdmin = (ctx: AccessContext) => {
  if (ctx.role !== 'agency_admin') throw new ToolError('permission_denied', 'Only agency admins change agency settings');
};
const requireAgencyFor = (ctx: AccessContext, clientId: string) => {
  if (!isAgencyRole(ctx.role)) throw new ToolError('permission_denied', 'Only agency roles manage delivery');
  if (!canAccessClient(ctx, clientId)) throw new ToolError('not_found', 'Client not found');
};

// ---- branding (decision 12; values must survive resolveBranding unchanged) ----
const HEX = /^#[0-9a-fA-F]{6}$/;
const LIMITS: Record<keyof AgencyBranding, number> = { displayName: 80, logoUrl: 500, primary: 7, secondary: 7, accent: 7, fromName: 80, fromEmail: 200, signOff: 300 };

function clean(input: AgencyBranding): AgencyBranding {
  const out: AgencyBranding = {};
  for (const key of Object.keys(LIMITS) as (keyof AgencyBranding)[]) {
    const v = input[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}

export function brandingProblems(input: AgencyBranding): string[] {
  const b = clean(input);
  const problems: string[] = [];
  for (const [key, max] of Object.entries(LIMITS) as [keyof AgencyBranding, number][]) {
    if ((b[key]?.length ?? 0) > max) problems.push(`${key} is longer than ${max} characters`);
  }
  for (const key of ['primary', 'secondary', 'accent'] as const) if (b[key] && !HEX.test(b[key]!)) problems.push(`${key} must be a colour like #47A8E7`);
  if (b.logoUrl) {
    try {
      if (new URL(b.logoUrl).protocol !== 'https:') problems.push('logoUrl must start with https://');
    } catch {
      problems.push('logoUrl is not a URL');
    }
  }
  if (b.fromEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.fromEmail)) problems.push('fromEmail is not an email address');
  return problems;
}

export async function getAgencyBranding(service: Db, ctx: AccessContext): Promise<{ stored: AgencyBranding; resolved: Branding }> {
  const [a] = await service.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, ctx.agencyId));
  if (!a) throw new ToolError('not_found', 'Agency not found');
  return { stored: a.branding ?? {}, resolved: resolveBranding(a.name, a.branding ?? null) };
}

export async function updateAgencyBranding(service: Db, ctx: AccessContext, input: AgencyBranding): Promise<void> {
  requireAdmin(ctx);
  const problems = brandingProblems(input);
  if (problems.length) throw new ToolError('invalid_input', problems.join('; '));
  await service.update(agency).set({ branding: clean(input) }).where(eq(agency.id, ctx.agencyId));
}

// ---- webhooks (the URL is a secret: never returned) ----
export interface WebhookView {
  id: string;
  kind: 'slack' | 'teams';
  host: string;
  kinds: string[] | null;
  active: boolean;
  createdAt: Date;
}

export async function listWebhooks(service: Db, ctx: AccessContext): Promise<WebhookView[]> {
  requireAdmin(ctx);
  const rows = await service.select().from(agencyWebhook).where(eq(agencyWebhook.agencyId, ctx.agencyId)).orderBy(asc(agencyWebhook.createdAt));
  return rows.map((w) => ({ id: w.id, kind: w.kind as WebhookView['kind'], host: new URL(w.url).hostname, kinds: w.kinds ?? null, active: w.active, createdAt: w.createdAt }));
}

export async function addWebhook(service: Db, ctx: AccessContext, input: { kind: 'slack' | 'teams'; url: string; kinds?: string[] | null }): Promise<string> {
  requireAdmin(ctx);
  const problem = webhookUrlProblem(input.kind, input.url);
  if (problem) throw new ToolError('invalid_input', problem);
  return addAgencyWebhook(service, { agencyId: ctx.agencyId, kind: input.kind, url: input.url.trim(), kinds: input.kinds ?? null, createdBy: ctx.userId });
}

export async function setWebhookActive(service: Db, ctx: AccessContext, id: string, active: boolean): Promise<void> {
  requireAdmin(ctx);
  const rows = await service.update(agencyWebhook).set({ active }).where(and(eq(agencyWebhook.id, id), eq(agencyWebhook.agencyId, ctx.agencyId))).returning({ id: agencyWebhook.id });
  if (rows.length === 0) throw new ToolError('not_found', 'Webhook not found');
}

// ---- client recipients (email-only contacts; members get theirs from acceptInvitations) ----
export interface RecipientView {
  contactId: string;
  email: string;
  name: string | null;
  role: string;
  active: boolean;
  hasAccount: boolean;
}

export async function listClientRecipients(service: Db, ctx: AccessContext, clientId: string): Promise<RecipientView[]> {
  requireAgencyFor(ctx, clientId);
  const rows = await service.select().from(contact).where(and(eq(contact.agencyId, ctx.agencyId), eq(contact.clientId, clientId))).orderBy(asc(sql`lower(${contact.email})`));
  return rows.map((c) => ({ contactId: c.id, email: c.email, name: c.name, role: c.role, active: c.active, hasAccount: c.userId !== null }));
}

export async function addClientRecipient(service: Db, ctx: AccessContext, input: { clientId: string; email: string; name?: string | null; role: 'client_owner' | 'client_viewer' }): Promise<string> {
  requireAgencyFor(ctx, input.clientId);
  if (input.role !== 'client_owner' && input.role !== 'client_viewer') throw new ToolError('invalid_input', 'Recipients are client owners or viewers');
  return addContact(service, { agencyId: ctx.agencyId, clientId: input.clientId, role: input.role, email: input.email.trim(), name: input.name?.trim() || null });
}

/** Stops delivery and kills every link already sent to this recipient (Review Focus 3). */
export async function deactivateRecipient(service: Db, ctx: AccessContext, contactId: string, now = new Date()): Promise<void> {
  const [c] = await service.select().from(contact).where(and(eq(contact.id, contactId), eq(contact.agencyId, ctx.agencyId), isNotNull(contact.clientId)));
  if (!c || !isAgencyRole(ctx.role) || !canAccessClient(ctx, c.clientId!)) throw new ToolError('not_found', 'Recipient not found');
  await service.update(contact).set({ active: false, linksRevokedBefore: now }).where(eq(contact.id, c.id));
}

// ---- client delivery mode ----
export async function updateClientDeliverySettings(deps: { service: Db; app: Db }, ctx: AccessContext, clientId: string, patch: { alertMode?: AlertMode; briefAutoSend?: boolean; timezone?: string }): Promise<void> {
  requireAgencyFor(ctx, clientId);
  if (patch.alertMode && !ALERT_MODES.includes(patch.alertMode)) throw new ToolError('invalid_input', 'Unknown alert mode');
  if (patch.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: patch.timezone });
    } catch {
      throw new ToolError('invalid_input', 'Unknown time zone');
    }
    await deps.service.update(client).set({ timezone: patch.timezone }).where(and(eq(client.id, clientId), eq(client.agencyId, ctx.agencyId)));
  }
  if (patch.alertMode !== undefined || patch.briefAutoSend !== undefined) {
    await updateClientDelivery(deps, ctx, clientId, { alertMode: patch.alertMode, briefAutoSend: patch.briefAutoSend });
  }
}
```

If `addContact`'s duplicate-email path surfaces a raw unique violation (4b carry-over, Task 3 minor), catch it in `addClientRecipient` and rethrow `new ToolError('invalid_input', 'That email already receives this client’s updates')` — add a test for it. Append `export * from './settings';` to `src/index.ts`.

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/tools exec vitest run src/settings.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tools
git commit -m "feat(tools): branding, webhook, recipient and client delivery settings"
```

---

### Task 7: `@cs/ui` — brand tokens, theme variables and base components

**Files:**
- Create: `packages/ui/package.json`, `tsconfig.json`, `vitest.config.ts`, `components.json`, `src/styles.css`, `src/theme.ts`, `src/lib/cn.ts`, `src/components/wordmark.tsx`, `src/components/friday-badge.tsx`, `src/components/*.tsx` (shadcn), `src/index.ts`
- Test: `packages/ui/src/theme.test.ts`, `packages/ui/src/components/wordmark.test.tsx`

**Interfaces:**
- Consumes: `Branding`, `RIVAL_MONDAY_TOKENS` (`@cs/email`).
- Produces:
  - `themeVars(b: Pick<Branding, 'primary' | 'secondary'>): Record<string, string>` — keys `--primary`, `--secondary`, `--primary-soft`, `--primary-soft-text`
  - `mixHex(a: string, b: string, t: number): string`
  - `cn(...classes: ClassValue[]): string`
  - Components: `Button`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Input`, `Label`, `Badge`, `Switch`, `Select*`, `Table*`, `DropdownMenu*`, `Dialog*`, `Separator`, `Wordmark({ name? })`, `FridayBadge({ name? })`
  - CSS entry `@cs/ui/styles.css` (exports map `"./styles.css": "./src/styles.css"`)

- [ ] **Step 1: Scaffold**

`packages/ui/package.json`:

```json
{
  "name": "@cs/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./styles.css": "./src/styles.css" },
  "scripts": { "typecheck": "tsc -p .", "test": "vitest run" },
  "dependencies": {
    "@cs/email": "workspace:*",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "latest",
    "radix-ui": "latest",
    "tailwind-merge": "^3.3.1"
  },
  "peerDependencies": { "react": "^19.3.0", "react-dom": "^19.3.0" },
  "devDependencies": {
    "@testing-library/react": "^16.3.3",
    "@types/node": "^22.18.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "jsdom": "latest",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```

After `pnpm install`, replace every `latest` with the resolved caret version from the lockfile (`^x.y.z`) so the manifest is pinned like the rest of the repo.

`tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2023", "DOM", "DOM.Iterable"], "jsx": "react-jsx" }, "include": ["src", "vitest.config.ts"] }`

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ esbuild: { jsx: 'automatic' }, test: { environment: 'node' } });
```

(Component tests opt into jsdom with a `// @vitest-environment jsdom` first line.)

`components.json` (shadcn CLI config for this package):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "", "css": "src/styles.css", "baseColor": "slate", "cssVariables": true },
  "iconLibrary": "lucide",
  "aliases": { "components": "@cs/ui/components", "ui": "@cs/ui/components", "utils": "@cs/ui/lib/cn", "lib": "@cs/ui/lib", "hooks": "@cs/ui/hooks" }
}
```

- [ ] **Step 2: Write the failing tests**

`packages/ui/src/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mixHex, themeVars } from './theme';

describe('mixHex', () => {
  it('mixes channel-wise and rounds', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#47A8E7', '#47A8E7', 0.3)).toBe('#47a8e7');
  });
});

describe('themeVars', () => {
  it('uses the brand constants for the default primary', () => {
    expect(themeVars({ primary: '#47A8E7', secondary: '#2A6BAC' })).toEqual({
      '--primary': '#47A8E7', '--secondary': '#2A6BAC', '--primary-soft': '#E3F2FC', '--primary-soft-text': '#1F6FA8',
    });
  });

  it('derives soft colours for an agency primary', () => {
    const v = themeVars({ primary: '#123ABC', secondary: '#000000' });
    expect(v['--primary-soft']).toBe(mixHex('#123ABC', '#ffffff', 0.86));
    expect(v['--primary-soft-text']).toBe(mixHex('#123ABC', '#0B2540', 0.45));
  });

  it('never emits a non-hex value (Review Focus 5)', () => {
    const v = themeVars({ primary: 'red;}body{display:none', secondary: 'url(x)' });
    expect(Object.values(v).every((x) => /^#[0-9a-fA-F]{6}$/.test(x))).toBe(true);
  });
});
```

`packages/ui/src/components/wordmark.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FridayBadge } from './friday-badge';
import { Wordmark } from './wordmark';

describe('Wordmark', () => {
  it('renders the two-colour rivalmonday wordmark by default', () => {
    const { container } = render(<Wordmark />);
    expect(container.textContent).toBe('rivalmonday');
    expect(container.querySelector('[data-part="rival"]')).not.toBeNull();
  });
  it('renders an agency display name instead when given', () => {
    render(<Wordmark name="Acme Marketing" />);
    expect(screen.getByText('Acme Marketing')).toBeTruthy();
  });
});

describe('FridayBadge', () => {
  it('shows the assistant name', () => {
    render(<FridayBadge name="Max" />);
    expect(screen.getByText('Max')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run to verify failure** — `pnpm --filter @cs/ui test` → FAIL.

- [ ] **Step 4: Implement theme, utils and brand components**

`packages/ui/src/theme.ts`:

```ts
import { RIVAL_MONDAY_TOKENS } from '@cs/email';

const HEX = /^#[0-9a-fA-F]{6}$/;
const safe = (v: string, fallback: string) => (HEX.test(v) ? v : fallback);
const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Linear mix: t = 0 → a, t = 1 → b. Inputs must be #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const [ca, cb] = [channels(a), channels(b)];
  return `#${ca.map((x, i) => Math.round(x + (cb[i]! - x) * t).toString(16).padStart(2, '0')).join('')}`;
}

const DEFAULT_SOFT = { soft: '#E3F2FC', text: '#1F6FA8' };

/** Decision 12: CSS variables for the root element; every value is a validated 6-digit hex. */
export function themeVars(b: { primary: string; secondary: string }): Record<string, string> {
  const primary = safe(b.primary, RIVAL_MONDAY_TOKENS.primary);
  const secondary = safe(b.secondary, RIVAL_MONDAY_TOKENS.secondary);
  const isDefault = primary.toLowerCase() === RIVAL_MONDAY_TOKENS.primary.toLowerCase();
  return {
    '--primary': primary,
    '--secondary': secondary,
    '--primary-soft': isDefault ? DEFAULT_SOFT.soft : mixHex(primary, '#ffffff', 0.86),
    '--primary-soft-text': isDefault ? DEFAULT_SOFT.text : mixHex(primary, RIVAL_MONDAY_TOKENS.ink, 0.45),
  };
}
```

`packages/ui/src/lib/cn.ts`:

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

`packages/ui/src/components/wordmark.tsx`:

```tsx
import { cn } from '../lib/cn';

/** Brand wordmark (brand.md): `rival` in secondary, `monday` in accent, weight 800. White-label agencies show their display name. */
export function Wordmark({ name, className }: { name?: string; className?: string }) {
  if (name) return <span className={cn('text-2xl font-extrabold tracking-tight text-secondary', className)}>{name}</span>;
  return (
    <span className={cn('text-2xl font-extrabold tracking-[-1px]', className)}>
      <span data-part="rival" className="text-secondary">rival</span>
      <span className="text-accent">monday</span>
    </span>
  );
}
```

`packages/ui/src/components/friday-badge.tsx`:

```tsx
/** The assistant pill (brand.md): #F5A524 background, #3B2300 text, weight 700. Agencies may rename the assistant. */
export function FridayBadge({ name = 'Friday' }: { name?: string }) {
  return <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-[#3B2300]">{name}</span>;
}
```

- [ ] **Step 5: Write the Tailwind theme**

`packages/ui/src/styles.css`:

```css
@import "tailwindcss";

/* Brand tokens (docs/brand/brand.md). --primary, --secondary, --primary-soft(-text) are overridden per agency
   on <html style="…"> by themeVars(); everything else is fixed. */
:root {
  --primary: #47A8E7;
  --secondary: #2A6BAC;
  --accent: #F5A524;
  --accent-text: #B45309;
  --ink: #0B2540;
  --muted-ink: #64748B;
  --line: #E2E8F0;
  --canvas: #F6F9FC;
  --surface: #FFFFFF;
  --muted-surface: #EEF2F6;
  --muted-surface-2: #E2E8F0;
  --success: #16A34A;
  --danger: #DC2626;
  --primary-soft: #E3F2FC;
  --primary-soft-text: #1F6FA8;
  --radius: 0.75rem;
}

@theme inline {
  --font-sans: var(--font-inter), Inter, system-ui, sans-serif;
  --color-primary: var(--primary);
  --color-primary-foreground: #FFFFFF;
  --color-secondary: var(--secondary);
  --color-secondary-foreground: #FFFFFF;
  --color-accent: var(--accent);
  --color-accent-foreground: #3B2300;
  --color-accent-text: var(--accent-text);
  --color-ink: var(--ink);
  --color-muted-ink: var(--muted-ink);
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-muted-surface: var(--muted-surface);
  --color-muted-surface-2: var(--muted-surface-2);
  --color-primary-soft: var(--primary-soft);
  --color-primary-soft-text: var(--primary-soft-text);
  --color-success: var(--success);
  --color-danger: var(--danger);
  /* shadcn/ui semantic names */
  --color-background: var(--canvas);
  --color-foreground: var(--ink);
  --color-card: var(--surface);
  --color-card-foreground: var(--ink);
  --color-popover: var(--surface);
  --color-popover-foreground: var(--ink);
  --color-muted: var(--muted-surface);
  --color-muted-foreground: var(--muted-ink);
  --color-border: var(--line);
  --color-input: var(--line);
  --color-ring: var(--primary);
  --color-destructive: var(--danger);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 2px);
  --shadow-card: 0 1px 3px rgba(11, 37, 64, .06), 0 1px 2px rgba(11, 37, 64, .04);
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground font-sans text-sm; }
}
```

- [ ] **Step 6: Add the shadcn components**

From `packages/ui`, run: `pnpm dlx shadcn@4.21.1 add button card input label badge switch select table dropdown-menu dialog separator`. If the CLI cannot resolve the `@cs/ui/...` aliases in a package without its own Tailwind entry, add the components from an `apps/web`-style temp project and move the files into `packages/ui/src/components/` — either way, rewrite their imports to relative paths (`../lib/cn`), and make `Card` use `rounded-[14px] shadow-card border-0 bg-card` to match the mockups. Then create `src/index.ts` exporting `theme`, `lib/cn`, and every component file.

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm --filter @cs/ui test` and `pnpm --filter @cs/ui typecheck` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): brand tokens, per-agency theme variables and base components"
```

---

### Task 8: Sign-in email template

**Files:**
- Create: `packages/email/src/templates/sign-in.tsx`
- Modify: `packages/email/src/types.ts` (new payload), `packages/email/src/render.ts` (switch case)
- Test: `packages/email/src/sign-in.test.ts`

**Interfaces:**
- Consumes: `Branding`, existing `Layout` (`packages/email/src/layout.tsx`).
- Produces: `interface SignInEmailProps { branding: Branding; url: string; expiresMinutes: number }`; `EmailPayload` gains `{ template: 'sign_in'; props: SignInEmailProps }`; `signInSubject(p)` → `` `Your sign-in link for ${p.branding.displayName}` ``.

- [ ] **Step 1: Write the failing test**

`packages/email/src/sign-in.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

describe('sign_in email', () => {
  it('renders a branded single-link email with plain-text fallback', async () => {
    const branding = resolveBranding('Acme Marketing', { primary: '#123ABC' });
    const url = 'https://rm.nofingers.ai/api/auth/magic-link/verify?token=abc&callbackURL=%2F';
    const out = await renderEmail({ template: 'sign_in', props: { branding, url, expiresMinutes: 15 } });
    expect(out.subject).toBe('Your sign-in link for Acme Marketing');
    expect(out.html).toContain(url.replace(/&/g, '&amp;'));
    expect(out.html).toContain('#123ABC');
    expect(out.text).toContain(url);
    expect(out.text).toMatch(/15 minutes/);
    expect(out.text).toMatch(/didn.t ask/i);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/email exec vitest run sign-in` → FAIL.

- [ ] **Step 3: Implement**

Read `packages/email/src/layout.tsx` (`Layout` takes `{ branding, title, preview, variant?, footer?, children }` and exports a `button(branding)` style helper) and one existing template (e.g. `templates/agency-notice.tsx`) first, and match their import style for `Button`/`Text`. `templates/sign-in.tsx`:

```tsx
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { Button, Text } from 'react-email';
import { button, Layout } from '../layout';
import type { SignInEmailProps } from '../types';

export const signInSubject = (p: SignInEmailProps) => `Your sign-in link for ${p.branding.displayName}`;

export function SignInEmail({ branding, url, expiresMinutes }: SignInEmailProps) {
  return (
    <Layout branding={branding} title={signInSubject({ branding, url, expiresMinutes })} preview={`Sign in to ${branding.displayName}`}>
      <Text>Use the button below to sign in to {branding.displayName}. The link works once and expires in {expiresMinutes} minutes.</Text>
      <Button href={url} style={button(branding)}>Sign in</Button>
      <Text>If the button does not work, paste this address into your browser: {url}</Text>
      <Text>If you didn’t ask to sign in, you can ignore this email.</Text>
    </Layout>
  );
}
```

In `types.ts` add `SignInEmailProps` and the union member; in `render.ts` add `case 'sign_in': return { el: createElement(SignInEmail, p.props), subject: signInSubject(p.props) };`.

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/email test` (includes `jsx-pragma.test.ts`) → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/email
git commit -m "feat(email): branded magic-link sign-in template"
```

---

### Task 9: `apps/web` scaffold

**Files:**
- Create: `apps/web/package.json`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `next-env.d.ts` (generated), `.gitignore`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/health/route.ts`, `src/server/env.ts`, `src/server/db.ts`, `test/server-only.ts`
- Modify: `turbo.json`, root `package.json` (scripts `dev:web`, `build`)
- Test: `apps/web/src/server/env.test.ts`

**Interfaces:**
- Produces:
  - `interface WebEnv { appUrl: string; appDatabaseUrl: string; serviceDatabaseUrl: string; queueDatabaseUrl: string; authSecret: string; linkSecrets: string[]; emailFrom: string; google: { clientId: string; clientSecret: string } | null; defaultAgencyId: string | null }`
  - `parseWebEnv(env: NodeJS.ProcessEnv): WebEnv` (throws listing every missing/invalid variable)
  - `webEnv(): WebEnv` (memoised `parseWebEnv(process.env)`)
  - `dbs(): { app: Db; service: Db }` (memoised per process)

- [ ] **Step 1: Read the docs**

Read `node_modules/turbo/docs/guides/frameworks/nextjs.mdx` and `crafting-your-repository/using-environment-variables.mdx`; after Step 2's install, read `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/` (installation, project structure, proxy) and `02-guides/upgrading/version-16.md`.

- [ ] **Step 2: Package and config**

`apps/web/package.json`:

```json
{
  "name": "@cs/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc -p .",
    "test": "vitest run",
    "e2e": "playwright test",
    "admin": "tsx scripts/admin.ts"
  },
  "dependencies": {
    "@cs/core": "workspace:*",
    "@cs/db": "workspace:*",
    "@cs/email": "workspace:*",
    "@cs/engine": "workspace:*",
    "@cs/storage": "workspace:*",
    "@cs/tools": "workspace:*",
    "@cs/ui": "workspace:*",
    "better-auth": "1.7.7",
    "drizzle-orm": "^0.44.5",
    "kysely": "^0.28.17",
    "lucide-react": "<same as @cs/ui>",
    "next": "16.3.8",
    "pg": "^8.23.1",
    "pg-boss": "^10.3.2",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "server-only": "^0.0.1",
    "zod": "^4.1.5"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "@tailwindcss/postcss": "^4.3.3",
    "@testing-library/react": "^16.3.3",
    "@types/node": "^22.18.0",
    "@types/pg": "^8.15.5",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "jsdom": "<same as @cs/ui>",
    "tailwindcss": "^4.3.3",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```

`next.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (Vercel injects env vars directly)
}

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@cs/core', '@cs/db', '@cs/email', '@cs/engine', '@cs/storage', '@cs/tools', '@cs/ui', '@cs/ai', '@cs/collectors', '@cs/verticals'],
  // Native/heavy server dependencies pulled in through @cs/engine → @cs/collectors; never bundled.
  serverExternalPackages: ['playwright', 'playwright-core', 'pg-boss', 'pg', 'postgres', 'compromise', 'cheerio', 'pdf-lib'],
  poweredByHeader: false,
};

export default config;
```

`postcss.config.mjs`: `export default { plugins: { '@tailwindcss/postcss': {} } };`

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "allowJs": false,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src", "test", "scripts", "e2e", "vitest.config.ts", "playwright.config.ts", "next.config.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // optional
}

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), 'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)) } },
  test: { include: ['src/**/*.test.{ts,tsx}'], globalSetup: ['../../packages/db/test/global-setup.ts'], fileParallelism: false, testTimeout: 30_000, hookTimeout: 60_000 },
});
```

`test/server-only.ts`: `export {};`

`.gitignore`: `.next/`, `test-results/`, `playwright-report/`, `.outbox/`.

`src/app/globals.css`:

```css
@import "@cs/ui/styles.css";
@source "../../../../packages/ui/src";
```

`src/app/layout.tsx` (Task 13 adds theming):

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', weight: ['400', '500', '600', '700', '800'] });

export const metadata: Metadata = { title: 'Rival Monday', robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
```

`src/app/health/route.ts`:

```ts
import { sql } from 'drizzle-orm';
import { dbs } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  await dbs().service.execute(sql`select 1`);
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Write the failing env test**

`apps/web/src/server/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseWebEnv } from './env';

const ok = {
  APP_URL: 'https://rm.nofingers.ai/', APP_DATABASE_URL: 'postgres://a', SERVICE_DATABASE_URL: 'postgres://s', DATABASE_URL: 'postgres://o',
  BETTER_AUTH_SECRET: 'b'.repeat(32), LINK_SIGNING_SECRET: 'l'.repeat(32), EMAIL_FROM: 'swkruger@nofingers.ai',
};

describe('parseWebEnv', () => {
  it('parses a complete environment', () => {
    const env = parseWebEnv(ok);
    expect(env).toMatchObject({ appUrl: 'https://rm.nofingers.ai', linkSecrets: ['l'.repeat(32)], google: null, defaultAgencyId: null, queueDatabaseUrl: 'postgres://o' });
  });

  it('adds the previous link secret and Google only when complete', () => {
    const env = parseWebEnv({ ...ok, LINK_SIGNING_SECRET_PREVIOUS: 'p'.repeat(32), GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'sec' });
    expect(env.linkSecrets).toHaveLength(2);
    expect(env.google).toEqual({ clientId: 'id', clientSecret: 'sec' });
    expect(parseWebEnv({ ...ok, GOOGLE_CLIENT_ID: 'id' }).google).toBeNull();
  });

  it('lists every problem at once', () => {
    expect(() => parseWebEnv({ ...ok, BETTER_AUTH_SECRET: 'short', APP_URL: undefined, DEFAULT_AGENCY_ID: 'nope' })).toThrow(/BETTER_AUTH_SECRET[\s\S]*APP_URL[\s\S]*DEFAULT_AGENCY_ID/);
  });
});
```

- [ ] **Step 4: Implement env and db**

`apps/web/src/server/env.ts`:

```ts
import 'server-only';
import { isUuid, MIN_LINK_SECRET_LENGTH } from '@cs/core';

export interface WebEnv {
  appUrl: string;
  appDatabaseUrl: string;
  serviceDatabaseUrl: string;
  /** Owner URL for pg-boss enqueue (decision 8; least privilege is a Phase 7 item). */
  queueDatabaseUrl: string;
  authSecret: string;
  linkSecrets: string[];
  emailFrom: string;
  google: { clientId: string; clientSecret: string } | null;
  defaultAgencyId: string | null;
}

export function parseWebEnv(env: NodeJS.ProcessEnv): WebEnv {
  const problems: string[] = [];
  const need = (key: string) => {
    const v = env[key]?.trim();
    if (!v) problems.push(`${key} is required`);
    return v ?? '';
  };
  const secret = (key: string) => {
    const v = need(key);
    if (v && v.length < MIN_LINK_SECRET_LENGTH) problems.push(`${key} must be at least ${MIN_LINK_SECRET_LENGTH} characters`);
    return v;
  };
  const authSecret = secret('BETTER_AUTH_SECRET');
  const appUrl = need('APP_URL').replace(/\/+$/, '');
  if (appUrl && !/^https?:\/\//.test(appUrl)) problems.push('APP_URL must be an http(s) URL');
  const link = secret('LINK_SIGNING_SECRET');
  const previous = env.LINK_SIGNING_SECRET_PREVIOUS?.trim();
  const defaultAgencyId = env.DEFAULT_AGENCY_ID?.trim() || null;
  if (defaultAgencyId && !isUuid(defaultAgencyId)) problems.push('DEFAULT_AGENCY_ID must be a uuid');
  const parsed: WebEnv = {
    appUrl, authSecret,
    appDatabaseUrl: need('APP_DATABASE_URL'), serviceDatabaseUrl: need('SERVICE_DATABASE_URL'), queueDatabaseUrl: need('DATABASE_URL'),
    linkSecrets: [link, ...(previous && previous.length >= MIN_LINK_SECRET_LENGTH ? [previous] : [])],
    emailFrom: env.EMAIL_FROM?.trim() || (appUrl ? `briefs@${safeHost(appUrl)}` : ''),
    google: env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() ? { clientId: env.GOOGLE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET.trim() } : null,
    defaultAgencyId,
  };
  if (problems.length) throw new Error(`Web app configuration problems:\n- ${problems.join('\n- ')}`);
  return parsed;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}

let cached: WebEnv | null = null;
export const webEnv = (): WebEnv => (cached ??= parseWebEnv(process.env));
```

Note the test's `APP_URL: undefined` case: `need` must report `APP_URL is required` *after* `BETTER_AUTH_SECRET` — order the `need`/`secret` calls as written so the thrown message lists them in the asserted order.

`apps/web/src/server/db.ts`:

```ts
import 'server-only';
import { createDb, type Db } from '@cs/db';
import { webEnv } from './env';

let cached: { app: Db; service: Db } | null = null;

/** One pool per role per server process (Fluid compute reuses it across requests). */
export function dbs(): { app: Db; service: Db } {
  if (!cached) {
    const env = webEnv();
    cached = { app: createDb(env.appDatabaseUrl).db, service: createDb(env.serviceDatabaseUrl).db };
  }
  return cached;
}
```

- [ ] **Step 5: Turbo and root scripts**

In `turbo.json`, add to `globalPassThroughEnv`: `APP_DATABASE_URL`, `SERVICE_DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DEFAULT_AGENCY_ID`, `EVIDENCE_FS_DIR`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (use the exact R2 variable names `packages/storage/src/env.ts` reads), `E2E_BASE_URL`. Add a task `"build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**"] }` following the installed Next.js guide. Root `package.json` scripts: `"dev:web": "pnpm --filter @cs/web dev"`, `"build": "turbo run build"`.

Add `BETTER_AUTH_SECRET` to the repo-root `.env` (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`; never print it). `.env` also needs `APP_DATABASE_URL`/`SERVICE_DATABASE_URL` (already present).

- [ ] **Step 6: Run tests, typecheck and a production build**

Run: `pnpm install`, `pnpm --filter @cs/web exec vitest run src/server/env.test.ts`, `pnpm --filter @cs/web typecheck`, `pnpm --filter @cs/web build`.
Expected: tests PASS; the build succeeds. Then `pnpm --filter @cs/web start` and `curl -s localhost:3000/health` → `{"ok":true}`; stop the server. If the build fails resolving something under `@cs/engine` → `@cs/collectors`, add the offending package to `serverExternalPackages` (never to `transpilePackages`) and note it in the commit message.

- [ ] **Step 7: Commit**

```bash
git add apps/web turbo.json package.json pnpm-lock.yaml
git commit -m "feat(web): Next.js 16 app scaffold with env validation and database pools"
```

---

### Task 10: Better Auth configuration

**Files:**
- Create: `apps/web/src/server/auth.ts`, `apps/web/src/server/auth-options.ts`, `apps/web/src/app/api/auth/[...all]/route.ts`, `apps/web/src/lib/auth-client.ts`, `apps/web/src/server/branding.ts`
- Test: `apps/web/src/server/auth-options.test.ts`, `apps/web/src/server/auth-schema.test.ts`

**Interfaces:**
- Consumes: `hasSignInRight`, `acceptInvitations` (`@cs/tools`); `renderEmail`, `createEmailTransportFromEnv`, `resolveBranding` (`@cs/email`); `createLedgerSink`, `agency` (`@cs/db`); `webEnv`, `dbs` (Task 9).
- Produces:
  - `MAGIC_LINK_MINUTES = 15`
  - `buildAuthOptions(deps: AuthDeps): BetterAuthOptions` where `interface AuthDeps { env: WebEnv; service: Db; pool: Pool; sendEmail: (to: string, payload: EmailPayload) => Promise<void>; branding: () => Promise<Branding>; now?: () => Date }`
  - `auth()` — memoised `betterAuth(buildAuthOptions(...))` with `nextCookies()` last
  - `defaultBranding(service: Db, env: WebEnv): Promise<Branding>` (in `branding.ts`; `DEFAULT_AGENCY_ID` agency, else Rival Monday defaults)
  - Client: `authClient` (`createAuthClient` + `magicLinkClient`), used by Task 12

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/auth-options.test.ts` — drives the real Better Auth instance against `cs_test` through its HTTP handler:

```ts
import { createMemoryTransport, renderEmail, resolveBranding } from '@cs/email';
import { invitation, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import { betterAuth } from 'better-auth';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildAuthOptions } from './auth-options';
import type { WebEnv } from './env';

const dbs = openTestDbs();
const pool = new Pool({ connectionString: testUrls.service });
afterAll(async () => {
  await pool.end();
  await dbs.closeAll();
});

const env: WebEnv = {
  appUrl: 'http://localhost:3000', appDatabaseUrl: testUrls.app, serviceDatabaseUrl: testUrls.service, queueDatabaseUrl: testUrls.owner,
  authSecret: 's'.repeat(40), linkSecrets: ['l'.repeat(40)], emailFrom: 'from@example.com', google: null, defaultAgencyId: null,
};
const mail = createMemoryTransport();
const auth = betterAuth(buildAuthOptions({
  env, service: dbs.service, pool,
  branding: async () => resolveBranding('Rival Monday', null),
  sendEmail: async (to, payload) => {
    const r = await renderEmail(payload);
    await mail.send({ from: env.emailFrom, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'sign_in', metadata: {} }, { agencyId: null, clientId: null });
  },
}));

const post = (path: string, body: unknown) =>
  auth.handler(new Request(`http://localhost:3000/api/auth${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body: JSON.stringify(body) }));
const linkFromMail = () => /https?:\/\/[^\s"]+magic-link\/verify[^\s"]+/.exec(mail.sent.at(-1)!.text)![0];

beforeEach(async () => {
  mail.sent.length = 0;
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
  await seedTenancy(dbs.owner);
});

describe('magic link sign-in', () => {
  it('sends nothing for an uninvited email but answers the same way', async () => {
    const res = await post('/sign-in/magic-link', { email: 'stranger@example.com', callbackURL: '/' });
    expect(res.status).toBe(200);
    expect(mail.sent).toHaveLength(0);
  });

  it('signs in an invited user, creating the user and accepting the invitation', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'new@example.com', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    expect((await post('/sign-in/magic-link', { email: 'New@Example.com', callbackURL: '/' })).status).toBe(200);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]!.subject).toBe('Your sign-in link for Rival Monday');
    const verify = await auth.handler(new Request(linkFromMail()));
    expect([200, 302]).toContain(verify.status);
    expect(verify.headers.get('set-cookie')).toMatch(/session_token/);
    const members = await dbs.service.select().from(membership);
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe('agency_admin');
  });

  it('refuses to create a user for an email whose invitation was revoked after the link was sent', async () => {
    await dbs.service.insert(invitation).values({ agencyId: IDS.agencyA, email: 'gone@example.com', role: 'agency_admin', invitedBy: 't', expiresAt: new Date(Date.now() + 86_400_000) });
    await post('/sign-in/magic-link', { email: 'gone@example.com', callbackURL: '/' });
    await dbs.service.update(invitation).set({ revokedAt: new Date() });
    const verify = await auth.handler(new Request(linkFromMail()));
    expect(verify.headers.get('set-cookie') ?? '').not.toMatch(/session_token=[^;]+;/);
    expect((await dbs.owner.execute(sql`select count(*)::int as n from auth."user"`))[0]).toMatchObject({ n: 0 });
  });
});
```

`apps/web/src/server/auth-schema.test.ts` — the drift guard:

```ts
import { resolveBranding } from '@cs/email';
import { openTestDbs, testUrls } from '@cs/db/test-helpers';
import { getMigrations } from 'better-auth/db/migration';
import { Pool } from 'pg';
import { afterAll, expect, it } from 'vitest';
import { buildAuthOptions } from './auth-options';

const dbs = openTestDbs();
const pool = new Pool({ connectionString: testUrls.owner });
afterAll(async () => {
  await pool.end();
  await dbs.closeAll();
});

it('migration 0035 matches what Better Auth expects (no pending auth migrations)', async () => {
  const env = { appUrl: 'http://localhost:3000', appDatabaseUrl: '', serviceDatabaseUrl: '', queueDatabaseUrl: '', authSecret: 's'.repeat(40), linkSecrets: ['l'.repeat(40)], emailFrom: 'x@y.co', google: null, defaultAgencyId: null };
  const opts = buildAuthOptions({ env, service: dbs.service, pool, sendEmail: async () => {}, branding: async () => resolveBranding('x', null) });
  const m = await getMigrations(opts, { throwOnUnsafe: false });
  expect({ created: m.toBeCreated.map((t) => t.table), added: m.toBeAdded.map((t) => t.table), problems: m.schemaProblems }).toEqual({ created: [], added: [], problems: [] });
});
```

If this test ever fails after a Better Auth upgrade, add a **new** migration with the SQL `compileMigrations()` prints — never edit 0035.

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/server/auth` → FAIL (module missing).

- [ ] **Step 3: Implement**

`apps/web/src/server/auth-options.ts` (no `server-only` import: the admin CLI and tests import it too):

```ts
import type { Db } from '@cs/db';
import type { Branding, EmailPayload } from '@cs/email';
import { acceptInvitations, hasSignInRight } from '@cs/tools';
import type { BetterAuthOptions } from 'better-auth';
import { magicLink } from 'better-auth/plugins/magic-link';
import { sql } from 'drizzle-orm';
import { PostgresDialect } from 'kysely';
import type { Pool } from 'pg';
import type { WebEnv } from './env';

export const MAGIC_LINK_MINUTES = 15;

export interface AuthDeps {
  env: WebEnv;
  service: Db;
  /** Service-role pg pool for Better Auth's Kysely adapter. */
  pool: Pool;
  sendEmail: (to: string, payload: EmailPayload) => Promise<void>;
  branding: () => Promise<Branding>;
  now?: () => Date;
}

export function buildAuthOptions(deps: AuthDeps): BetterAuthOptions {
  const now = deps.now ?? (() => new Date());
  return {
    appName: 'Rival Monday',
    baseURL: deps.env.appUrl,
    secret: deps.env.authSecret,
    trustedOrigins: [deps.env.appUrl],
    database: { dialect: new PostgresDialect({ pool: deps.pool }), type: 'postgres', schemaName: 'auth' },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },
    socialProviders: deps.env.google ? { google: { clientId: deps.env.google.clientId, clientSecret: deps.env.google.clientSecret, prompt: 'select_account' } } : {},
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_MINUTES * 60,
        // Decision 2: no link for people without a right to sign in; the response is identical either way.
        sendMagicLink: async ({ email, url }) => {
          if (!(await hasSignInRight(deps.service, email, now()))) return;
          await deps.sendEmail(email, { template: 'sign_in', props: { branding: await deps.branding(), url, expiresMinutes: MAGIC_LINK_MINUTES } });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          // Covers Google and a magic link whose invitation was revoked after it was sent.
          before: async (user) => ((await hasSignInRight(deps.service, user.email, now())) ? undefined : false),
        },
      },
      session: {
        create: {
          after: async (session) => {
            const rows = await deps.service.execute<{ id: string; email: string; name: string; verified: boolean }>(
              sql`select id, email, name, "emailVerified" as verified from auth."user" where id = ${session.userId}`,
            );
            const u = rows[0];
            if (u?.verified) await acceptInvitations(deps.service, { id: u.id, email: u.email, name: u.name }, now());
          },
        },
      },
    },
  };
}
```

`hasSignInRight` for a *new* user is the pending-invitation half (the membership half needs an existing user). Check the Better Auth type of `before`'s return (`Promise<boolean | void | { data }>`) and adjust the ternary if TypeScript requires `true`.

`apps/web/src/server/branding.ts`:

```ts
import 'server-only';
import { agency, type Db } from '@cs/db';
import { type Branding, resolveBranding } from '@cs/email';
import { eq } from 'drizzle-orm';
import type { WebEnv } from './env';

/** Decision 12: the host's agency before sign-in (single host in MVP), else Rival Monday defaults. */
export async function defaultBranding(service: Db, env: WebEnv): Promise<Branding> {
  if (env.defaultAgencyId) {
    const [a] = await service.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, env.defaultAgencyId));
    if (a) return resolveBranding(a.name, a.branding ?? null);
  }
  return resolveBranding('Rival Monday', null);
}
```

`apps/web/src/server/auth.ts`:

```ts
import 'server-only';
import { createLedgerSink } from '@cs/db';
import { createEmailTransportFromEnv, renderEmail } from '@cs/email';
import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool } from 'pg';
import { buildAuthOptions } from './auth-options';
import { defaultBranding } from './branding';
import { dbs } from './db';
import { webEnv } from './env';

function create() {
  const env = webEnv();
  const { service } = dbs();
  const transport = createEmailTransportFromEnv(process.env, createLedgerSink(service));
  const options = buildAuthOptions({
    env, service, pool: new Pool({ connectionString: env.serviceDatabaseUrl, max: 5 }),
    branding: () => defaultBranding(service, env),
    sendEmail: async (to, payload) => {
      const r = await renderEmail(payload);
      await transport.send({ from: env.emailFrom, to, replyTo: null, subject: r.subject, html: r.html, text: r.text, tag: 'sign_in', metadata: {} }, { agencyId: null, clientId: null });
    },
  });
  return betterAuth({ ...options, plugins: [...(options.plugins ?? []), nextCookies()] });
}

let instance: ReturnType<typeof create> | null = null;
export const auth = () => (instance ??= create());
```

`apps/web/src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/server/auth';

const handler = (req: Request) => auth().handler(req);
export const { GET, POST } = toNextJsHandler(handler);
```

`apps/web/src/lib/auth-client.ts`:

```ts
'use client';
import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
```

The file outbox resolves `EMAIL_OUTBOX_DIR` (default `./.outbox`) against the process cwd — for the web app that is `apps/web/.outbox/` (gitignored in Task 9).

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/web exec vitest run src/server/auth` → PASS. Run `pnpm --filter @cs/web typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): invitation-only Better Auth with magic links and optional Google"
```

---

### Task 11: Viewer resolution, guest sessions, safe redirects and `proxy.ts`

**Files:**
- Create: `apps/web/src/server/safe-next.ts`, `apps/web/src/server/guest.ts`, `apps/web/src/server/viewer.ts`, `apps/web/src/server/current-viewer.ts`, `apps/web/src/proxy.ts`
- Test: `apps/web/src/server/safe-next.test.ts`, `apps/web/src/server/guest.test.ts`, `apps/web/src/server/viewer.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 9, 10.
- Produces:
  - `safeNext(raw: string | null | undefined): string` — same-origin path or `'/'`
  - `GUEST_COOKIE = 'rm_guest'`, `GUEST_TTL_SECONDS = 86_400`, `MEMBERSHIP_COOKIE = 'rm_membership'`
  - `signGuest(secret: string, claims: Omit<GuestSessionClaims, 'iat'>, now?: Date): string`; `verifyGuest(secrets: readonly string[], value: string, now?: Date): GuestSessionClaims | null`
  - `type Viewer = { kind: 'user'; userId: string; email: string; name: string; ctx: AccessContext; membership: MembershipSummary; memberships: MembershipSummary[] } | { kind: 'member-less'; userId: string; email: string; name: string } | { kind: 'guest'; contactId: string; ctx: AccessContext }`
  - `resolveViewer(input: { service: Db; session: { userId: string; email: string; name: string } | null; membershipCookie?: string; guestCookie?: string; linkSecrets: readonly string[]; now?: Date }): Promise<Viewer | null>` in `viewer.ts` (no Next imports; tested)
  - In `current-viewer.ts` (Next-facing): `getViewer(): Promise<Viewer | null>` (React `cache`, reads Next cookies/headers); `requireViewer(): Promise<Viewer>` (redirects to `/sign-in?next=…`); `requireContext(): Promise<{ viewer: Exclude<Viewer, { kind: 'member-less' }>; ctx: AccessContext }>` (member-less → `/no-access`)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/safe-next.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext (Review Focus 2)', () => {
  it.each([
    ['/c/123/briefs/9', '/c/123/briefs/9'],
    ['/inbox?x=1#y', '/inbox?x=1#y'],
    [null, '/'], ['', '/'], ['//evil.com', '/'], ['/\\evil.com', '/'], ['https://evil.com', '/'],
    ['javascript:alert(1)', '/'], ['/%2F%2Fevil.com', '/%2F%2Fevil.com'], [' /inbox', '/'], ['/a\nb', '/'],
  ])('%s → %s', (raw, want) => expect(safeNext(raw)).toBe(want));
});
```

`apps/web/src/server/guest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { signGuest, verifyGuest } from './guest';

const S = 'k'.repeat(40);
const claims = { contactId: '11111111-1111-4111-8111-111111111111', agencyId: '22222222-2222-4222-8222-222222222222', clientId: '33333333-3333-4333-8333-333333333333' };
const t0 = new Date('2026-10-05T12:00:00Z');

describe('guest cookie', () => {
  it('round-trips within 24 hours', () => {
    const v = signGuest(S, claims, t0);
    expect(verifyGuest([S], v, new Date('2026-10-06T11:59:00Z'))).toEqual({ ...claims, iat: t0.getTime() / 1000 });
  });
  it('expires after 24 hours and rejects tampering or other secrets', () => {
    const v = signGuest(S, claims, t0);
    expect(verifyGuest([S], v, new Date('2026-10-06T12:00:01Z'))).toBeNull();
    expect(verifyGuest(['x'.repeat(40)], v, t0)).toBeNull();
    const [p, sig] = v.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p!, 'base64url').toString()), clientId: claims.agencyId })).toString('base64url');
    expect(verifyGuest([S], `${forged}.${sig}`, t0)).toBeNull();
  });
  it('is not interchangeable with a link token signed by the same secret', async () => {
    const { signLink } = await import('@cs/core');
    const token = signLink(S, { sub: claims.contactId, agency: claims.agencyId, client: claims.clientId, t: 'brief', id: claims.clientId }, t0);
    expect(verifyGuest([S], token, t0)).toBeNull();
  });
});
```

`apps/web/src/server/viewer.test.ts` (against `cs_test`):

```ts
import { contact, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signGuest } from './guest';
import { resolveViewer } from './viewer';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const S = ['k'.repeat(40)];
const NOW = new Date('2026-10-05T12:00:00Z');
const session = { userId: 'u1', email: 'p@e.co', name: 'Pat' };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('u1', 'Pat', 'p@e.co', true)`);
});

describe('resolveViewer', () => {
  it('returns null with no session and no guest cookie', async () => {
    expect(await resolveViewer({ service: dbs.service, session: null, linkSecrets: S, now: NOW })).toBeNull();
  });

  it('returns member-less for a signed-in user with no memberships', async () => {
    expect(await resolveViewer({ service: dbs.service, session, linkSecrets: S, now: NOW })).toMatchObject({ kind: 'member-less' });
  });

  it('builds the context of the cookie membership, else the oldest', async () => {
    const [a] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'agency_admin', createdBy: 't', createdAt: new Date('2026-10-01T00:00:00Z') }).returning();
    const [b] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyB, role: 'client_owner', clientId: IDS.clientB1, createdBy: 't' }).returning();
    const first = await resolveViewer({ service: dbs.service, session, linkSecrets: S, now: NOW });
    expect(first).toMatchObject({ kind: 'user', membership: { id: a!.id } });
    const second = await resolveViewer({ service: dbs.service, session, membershipCookie: b!.id, linkSecrets: S, now: NOW });
    expect(second?.kind === 'user' && second.ctx.clientScope).toEqual([IDS.clientB1]);
  });

  it('prefers a signed-in user over a guest cookie, and stops honouring a guest cookie once the contact is deactivated (Review Focus 3)', async () => {
    const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'g@e.co' }).returning();
    const cookie = signGuest(S[0]!, { contactId: c!.id, agencyId: IDS.agencyA, clientId: IDS.clientA1 }, NOW);
    expect(await resolveViewer({ service: dbs.service, session: null, guestCookie: cookie, linkSecrets: S, now: NOW })).toMatchObject({ kind: 'guest', contactId: c!.id });
    expect(await resolveViewer({ service: dbs.service, session, guestCookie: cookie, linkSecrets: S, now: NOW })).toMatchObject({ kind: 'member-less' });
    await dbs.service.update(contact).set({ active: false });
    expect(await resolveViewer({ service: dbs.service, session: null, guestCookie: cookie, linkSecrets: S, now: NOW })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/server/safe-next.ts`:

```ts
/** Review Focus 2: only same-origin absolute paths survive; everything else is "/". */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return '/';
  if (/[\u0000-\u001f\\]/.test(raw)) return '/';
  try {
    const u = new URL(raw, 'http://local.invalid');
    if (u.origin !== 'http://local.invalid') return '/';
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return '/';
  }
}
```

`apps/web/src/server/guest.ts`:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUuid } from '@cs/core';
import type { GuestSessionClaims } from '@cs/tools';

export const GUEST_COOKIE = 'rm_guest';
export const GUEST_TTL_SECONDS = 86_400;
const DOMAIN = 'rm-guest-session.v1';
const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(`${DOMAIN}.${payload}`).digest();

/** Decision 6: an HMAC-signed, domain-separated cookie value; never interchangeable with a /l/ link token. */
export function signGuest(secret: string, claims: Omit<GuestSessionClaims, 'iat'>, now = new Date()): string {
  const payload = Buffer.from(JSON.stringify({ ...claims, iat: Math.floor(now.getTime() / 1000) })).toString('base64url');
  return `${payload}.${mac(secret, payload).toString('base64url')}`;
}

export function verifyGuest(secrets: readonly string[], value: string, now = new Date()): GuestSessionClaims | null {
  const [payload, sig, extra] = value.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, 'base64url');
  if (!secrets.some((s) => { const want = mac(s, payload); return want.length === given.length && timingSafeEqual(want, given); })) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GuestSessionClaims;
    if (![c.contactId, c.agencyId, c.clientId].every((x) => typeof x === 'string' && isUuid(x)) || typeof c.iat !== 'number') return null;
    if ((c.iat + GUEST_TTL_SECONDS) * 1000 <= now.getTime()) return null;
    return { contactId: c.contactId, agencyId: c.agencyId, clientId: c.clientId, iat: c.iat };
  } catch {
    return null;
  }
}
```

`apps/web/src/server/viewer.ts`:

```ts
import type { AccessContext } from '@cs/core';
import type { Db } from '@cs/db';
import { accessContextFor, guestAccessFor, listMemberships, type MembershipSummary, pickMembership } from '@cs/tools';
import { verifyGuest } from './guest';

export const MEMBERSHIP_COOKIE = 'rm_membership';

export type Viewer =
  | { kind: 'user'; userId: string; email: string; name: string; ctx: AccessContext; membership: MembershipSummary; memberships: MembershipSummary[] }
  | { kind: 'member-less'; userId: string; email: string; name: string }
  | { kind: 'guest'; contactId: string; ctx: AccessContext };

export async function resolveViewer(input: {
  service: Db;
  session: { userId: string; email: string; name: string } | null;
  membershipCookie?: string;
  guestCookie?: string;
  linkSecrets: readonly string[];
  now?: Date;
}): Promise<Viewer | null> {
  const { service, session } = input;
  if (session) {
    const memberships = await listMemberships(service, session.userId);
    const m = pickMembership(memberships, input.membershipCookie);
    if (!m) return { kind: 'member-less', ...session };
    return { kind: 'user', ...session, ctx: await accessContextFor(service, session.userId, m), membership: m, memberships };
  }
  if (input.guestCookie) {
    const claims = verifyGuest(input.linkSecrets, input.guestCookie, input.now);
    const ctx = claims ? await guestAccessFor(input.service, claims) : null;
    if (claims && ctx) return { kind: 'guest', contactId: claims.contactId, ctx };
  }
  return null;
}
```

The Next-facing part lives in `apps/web/src/server/current-viewer.ts` so `resolveViewer` stays free of Next imports:

```ts
import 'server-only';
import type { AccessContext } from '@cs/core';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from './auth';
import { dbs } from './db';
import { webEnv } from './env';
import { GUEST_COOKIE } from './guest';
import { MEMBERSHIP_COOKIE, resolveViewer, type Viewer } from './viewer';

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const [h, jar] = [await headers(), await cookies()];
  const s = await auth().api.getSession({ headers: h });
  return resolveViewer({
    service: dbs().service,
    session: s ? { userId: s.user.id, email: s.user.email, name: s.user.name } : null,
    membershipCookie: jar.get(MEMBERSHIP_COOKIE)?.value,
    guestCookie: jar.get(GUEST_COOKIE)?.value,
    linkSecrets: webEnv().linkSecrets,
  });
});

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) {
    const path = (await headers()).get('x-rm-path') ?? '/';
    redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  }
  return v;
}

export async function requireContext(): Promise<{ viewer: Exclude<Viewer, { kind: 'member-less' }>; ctx: AccessContext }> {
  const v = await requireViewer();
  if (v.kind === 'member-less') redirect('/no-access');
  return { viewer: v, ctx: v.ctx };
}
```

`apps/web/src/proxy.ts` — cheap presence check only (real checks happen in `requireViewer`); also forwards the path for `requireViewer`'s `next`:

```ts
import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC = [/^\/sign-in(\/|$)/, /^\/api\/auth\//, /^\/l\//, /^\/health$/, /^\/link-expired$/, /^\/link-other-account$/, /^\/_next\//, /^\/favicon/];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.set('x-rm-path', `${pathname}${search}`);
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next({ request: { headers } });
  const hasSession = req.cookies.getAll().some((c) => c.name.endsWith('session_token'));
  if (!hasSession && !req.cookies.has('rm_guest')) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

Check `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` for the exact export name (`proxy` vs default) and `config.matcher` shape in 16.3 and adjust.

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/web exec vitest run src/server/safe-next.test.ts src/server/guest.test.ts src/server/viewer.test.ts` → PASS; typecheck.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): viewer resolution, guest link sessions, safe redirects and proxy"
```

---

### Task 12: Sign-in and access pages

**Files:**
- Create: `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/sign-in/sign-in-form.tsx`, `apps/web/src/app/sign-in/check-email/page.tsx`, `apps/web/src/app/no-access/page.tsx`, `apps/web/src/app/link-expired/page.tsx`, `apps/web/src/app/link-other-account/page.tsx`, `apps/web/src/components/sign-out-button.tsx`, `apps/web/src/components/auth-card.tsx`
- Test: `apps/web/src/app/sign-in/sign-in-form.test.tsx`

**Interfaces:**
- Consumes: `authClient` (Task 10), `safeNext` (Task 11), `defaultBranding` (Task 10), `getViewer`/`requireViewer` (Task 11), `Wordmark`, `Button`, `Input`, `Label`, `Card*` (`@cs/ui`).
- Produces: `SignInForm({ next, googleEnabled, error }: { next: string; googleEnabled: boolean; error: string | null })` (client component); `SignOutButton()` (client component: `authClient.signOut()` then `window.location.assign('/sign-in')`); `AuthCard({ branding, title, children })` (server component: centred card with the agency logo/wordmark on the canvas background).

- [ ] **Step 1: Write the failing component test**

`apps/web/src/app/sign-in/sign-in-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const magicLink = vi.fn(async () => ({ data: { status: true }, error: null }));
const social = vi.fn(async () => ({ data: null, error: null }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { magicLink, social } } }));
const assign = vi.fn();
Object.defineProperty(window, 'location', { value: { assign }, writable: true });

const { SignInForm } = await import('./sign-in-form');

beforeEach(() => vi.clearAllMocks());

describe('SignInForm', () => {
  it('requests a magic link with the safe next path and goes to check-email', async () => {
    render(<SignInForm next="/c/1/briefs/2" googleEnabled={false} error={null} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'pat@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /email me a sign-in link/i }));
    await waitFor(() => expect(magicLink).toHaveBeenCalledWith({ email: 'pat@example.com', callbackURL: '/c/1/briefs/2', errorCallbackURL: '/sign-in?error=link' }));
    expect(assign).toHaveBeenCalledWith('/sign-in/check-email');
  });

  it('shows Google only when enabled and passes the next path', async () => {
    const { rerender } = render(<SignInForm next="/" googleEnabled={false} error={null} />);
    expect(screen.queryByRole('button', { name: /google/i })).toBeNull();
    rerender(<SignInForm next="/inbox" googleEnabled error={null} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/inbox', errorCallbackURL: '/sign-in?error=google' }));
  });

  it('explains an expired or used link', () => {
    render(<SignInForm next="/" googleEnabled={false} error="link" />);
    expect(screen.getByRole('alert').textContent).toMatch(/expired or was already used/i);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @cs/web exec vitest run src/app/sign-in` → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/app/sign-in/sign-in-form.tsx`:

```tsx
'use client';
import { Button, Input, Label } from '@cs/ui';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

const ERRORS: Record<string, string> = {
  link: 'That sign-in link expired or was already used. Ask for a new one below.',
  google: 'Google sign-in did not work for this account. Use the email you were invited with.',
};

export function SignInForm({ next, googleEnabled, error }: { next: string; googleEnabled: boolean; error: string | null }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(error ? ERRORS[error] ?? 'Sign-in failed. Try again.' : null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: next, errorCallbackURL: '/sign-in?error=link' });
    setBusy(false);
    if (res.error) return setProblem('We could not send a link just now. Wait a minute and try again.');
    window.location.assign('/sign-in/check-email');
  }

  return (
    <form onSubmit={sendLink} className="flex flex-col gap-4">
      {problem && <p role="alert" className="rounded-lg bg-muted-surface p-3 text-ink">{problem}</p>}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <Button type="submit" disabled={busy}>Email me a sign-in link</Button>
      {googleEnabled && (
        <Button type="button" variant="outline" onClick={() => authClient.signIn.social({ provider: 'google', callbackURL: next, errorCallbackURL: '/sign-in?error=google' })}>
          Continue with Google
        </Button>
      )}
    </form>
  );
}
```

`apps/web/src/components/auth-card.tsx`:

```tsx
import type { Branding } from '@cs/email';
import { Card, CardContent, CardHeader, CardTitle, Wordmark } from '@cs/ui';

export function AuthCard({ branding, title, children }: { branding: Branding; title: string; children: React.ReactNode }) {
  const whiteLabel = branding.displayName !== 'Rival Monday';
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          {branding.logoUrl ? <img src={branding.logoUrl} alt={branding.displayName} className="h-10 w-auto self-start" /> : <Wordmark name={whiteLabel ? branding.displayName : undefined} />}
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}
```

(`logoUrl` is only ever an `https` URL — `resolveBranding` drops anything else; Review Focus 5.)

`apps/web/src/app/sign-in/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { defaultBranding } from '@/server/branding';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { safeNext } from '@/server/safe-next';
import { SignInForm } from './sign-in-form';

export const dynamic = 'force-dynamic';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  const viewer = await getViewer();
  if (viewer && viewer.kind !== 'guest') redirect(target);
  const env = webEnv();
  return (
    <AuthCard branding={await defaultBranding(dbs().service, env)} title="Sign in">
      <SignInForm next={target} googleEnabled={env.google !== null} error={error ?? null} />
    </AuthCard>
  );
}
```

The remaining pages are short server components using `AuthCard`:
- `sign-in/check-email/page.tsx`: title "Check your email"; text "If this address has access, a sign-in link is on its way. It works once and expires in 15 minutes."; link back to `/sign-in`. (Same text whether or not an email was sent — decision 2.)
- `no-access/page.tsx`: `requireViewer()`; a viewer of kind `user` or `guest` is `redirect('/')`ed; a member-less viewer sees title "No workspace yet", "You are signed in as {email}, but you have not been added to a workspace. Ask your account manager for an invitation." and `SignOutButton`.
- `link-expired/page.tsx`: title "This link has expired"; "Links in our emails work for 30 days, and stop working if you were removed as a recipient. Sign in to see the latest brief." + link to `/sign-in`.
- `link-other-account/page.tsx`: title "This link was sent to someone else"; "You are signed in with a different account. Sign out, then open the link from your email again." + `SignOutButton`. (Review Focus 1.)

`apps/web/src/components/sign-out-button.tsx`:

```tsx
'use client';
import { Button } from '@cs/ui';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  return <Button variant="outline" onClick={async () => { await authClient.signOut(); window.location.assign('/sign-in'); }}>Sign out</Button>;
}
```

- [ ] **Step 4: Run tests** — `pnpm --filter @cs/web exec vitest run src/app/sign-in` → PASS; `pnpm --filter @cs/web typecheck`.

- [ ] **Step 5: Manual check**

`pnpm --filter @cs/web dev`, open `http://localhost:3000/agency` → redirected to `/sign-in?next=%2Fagency`; submit an uninvited address → check-email page and **no** new file in `apps/web/.outbox/`. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): sign-in, check-email, no-access and link pages"
```

---

### Task 13: Themed app shell, navigation and home routing

**Files:**
- Create: `apps/web/src/server/theme.ts`, `apps/web/src/server/tools.ts`, `apps/web/src/server/nav.ts`, `apps/web/src/app/page.tsx`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(app)/actions.ts`, `apps/web/src/app/(app)/agency/page.tsx`, `apps/web/src/app/(app)/c/[clientId]/page.tsx`, `apps/web/src/components/shell/{sidebar,top-bar,client-switcher,membership-switcher,inbox-bell,guest-banner}.tsx`
- Modify: `apps/web/src/app/layout.tsx` (theme variables on `<html>`)
- Test: `apps/web/src/server/nav.test.ts`, `apps/web/src/server/tools.test.ts`

**Interfaces:**
- Consumes: Tasks 4–7, 10, 11.
- Produces:
  - `themeForViewer(viewer: Viewer | null): Promise<{ branding: Branding; style: Record<string, string> }>`
  - `registry(): ToolRegistry<ToolDeps>`; `callTool<T>(ctx: AccessContext, name: string, input: unknown): Promise<T>` — `not_found`/`permission_denied`/`invalid_input` → `notFound()`; `isHiddenToolError(e: unknown): boolean`
  - `interface NavItem { href: string; label: string; icon: 'clients' | 'overview' | 'inbox' | 'team' | 'branding' | 'webhooks' | 'bell' | 'delivery' }`; `navFor(v: { kind: 'user' | 'guest'; ctx: AccessContext }, clientId: string | null): NavItem[]`
  - `homePath(ctx: AccessContext): string` — agency roles `/agency`, client roles `/c/<client>`
  - Server action `switchMembership(formData)` (field `membershipId`)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/nav.test.ts`:

```ts
import { createAccessContext } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { homePath, navFor } from './nav';

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000a1';
const ctx = (role: 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer') =>
  createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role.startsWith('client') ? [C] : 'all', features: [] });

describe('navFor', () => {
  it('gives admins agency settings', () => {
    expect(navFor({ kind: 'user', ctx: ctx('agency_admin') }, null).map((n) => n.href)).toEqual(['/agency', '/inbox', '/agency/team', '/agency/branding', '/agency/webhooks', '/settings/notifications']);
  });
  it('gives account managers team but not branding/webhooks, plus client pages inside a client', () => {
    const hrefs = navFor({ kind: 'user', ctx: ctx('account_manager') }, C).map((n) => n.href);
    expect(hrefs).toEqual(['/agency', `/c/${C}`, `/c/${C}/settings/delivery`, '/inbox', '/agency/team', '/settings/notifications']);
  });
  it('gives client users their overview, inbox and preferences', () => {
    expect(navFor({ kind: 'user', ctx: ctx('client_viewer') }, C).map((n) => n.href)).toEqual([`/c/${C}`, '/inbox', '/settings/notifications']);
  });
  it('gives guests no settings', () => {
    expect(navFor({ kind: 'guest', ctx: ctx('client_viewer') }, C).map((n) => n.href)).toEqual([`/c/${C}`, '/inbox']);
  });
});

describe('homePath', () => {
  it('routes agency roles to the client list and client roles to their client', () => {
    expect(homePath(ctx('account_manager'))).toBe('/agency');
    expect(homePath(ctx('client_owner'))).toBe(`/c/${C}`);
  });
});
```

`apps/web/src/server/tools.test.ts`:

```ts
import { ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { isHiddenToolError } from './tools';

describe('isHiddenToolError', () => {
  it('hides not_found, permission_denied and invalid_input behind a 404', () => {
    expect(isHiddenToolError(new ToolError('not_found', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('permission_denied', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('invalid_input', 'x'))).toBe(true);
    expect(isHiddenToolError(new ToolError('internal', 'x'))).toBe(false);
    expect(isHiddenToolError(new Error('x'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement the server helpers**

`apps/web/src/server/nav.ts`:

```ts
import { type AccessContext, isAgencyRole } from '@cs/core';

export interface NavItem {
  href: string;
  label: string;
  icon: 'clients' | 'overview' | 'inbox' | 'team' | 'branding' | 'webhooks' | 'bell' | 'delivery';
}

export function homePath(ctx: AccessContext): string {
  return isAgencyRole(ctx.role) || ctx.clientScope === 'all' ? '/agency' : `/c/${ctx.clientScope[0]}`;
}

/** 5b/5c add their modules here; only screens that exist are listed. */
export function navFor(v: { kind: 'user' | 'guest'; ctx: AccessContext }, clientId: string | null): NavItem[] {
  const { ctx } = v;
  const items: NavItem[] = [];
  if (isAgencyRole(ctx.role)) {
    items.push({ href: '/agency', label: 'Clients', icon: 'clients' });
    if (clientId) {
      items.push({ href: `/c/${clientId}`, label: 'Overview', icon: 'overview' });
      items.push({ href: `/c/${clientId}/settings/delivery`, label: 'Delivery', icon: 'delivery' });
    }
  } else {
    items.push({ href: homePath(ctx), label: 'Overview', icon: 'overview' });
  }
  items.push({ href: '/inbox', label: 'Inbox', icon: 'inbox' });
  if (isAgencyRole(ctx.role)) items.push({ href: '/agency/team', label: 'Team', icon: 'team' });
  if (ctx.role === 'agency_admin') {
    items.push({ href: '/agency/branding', label: 'Branding', icon: 'branding' });
    items.push({ href: '/agency/webhooks', label: 'Slack & Teams', icon: 'webhooks' });
  }
  if (v.kind === 'user') items.push({ href: '/settings/notifications', label: 'Notifications', icon: 'bell' });
  return items;
}
```

`apps/web/src/server/tools.ts`:

```ts
import 'server-only';
import { type AccessContext, ToolError, type ToolRegistry } from '@cs/core';
import { createToolRegistry, type ToolDeps } from '@cs/tools';
import { notFound } from 'next/navigation';
import { dbs } from './db';

let cached: ToolRegistry<ToolDeps> | null = null;
export const registry = () => (cached ??= createToolRegistry(dbs()));

/** Spec §11: refusals and "not yours" both look like "does not exist". */
export function isHiddenToolError(e: unknown): boolean {
  return e instanceof ToolError && (e.code === 'not_found' || e.code === 'permission_denied' || e.code === 'invalid_input');
}

export async function callTool<T>(ctx: AccessContext, name: string, input: unknown): Promise<T> {
  try {
    return (await registry().invoke(ctx, name, input)) as T;
  } catch (e) {
    if (isHiddenToolError(e)) notFound();
    throw e;
  }
}
```

`apps/web/src/server/theme.ts`:

```ts
import 'server-only';
import type { Branding } from '@cs/email';
import { getAgencyBranding } from '@cs/tools';
import { themeVars } from '@cs/ui';
import { defaultBranding } from './branding';
import { dbs } from './db';
import { webEnv } from './env';
import type { Viewer } from './viewer';

export async function themeForViewer(viewer: Viewer | null): Promise<{ branding: Branding; style: Record<string, string> }> {
  const branding = viewer && viewer.kind !== 'member-less' ? (await getAgencyBranding(dbs().service, viewer.ctx)).resolved : await defaultBranding(dbs().service, webEnv());
  return { branding, style: themeVars(branding) };
}
```

- [ ] **Step 4: Root layout, home redirect and shell**

`apps/web/src/app/layout.tsx` — make it `async`: `const { style } = await themeForViewer(await getViewer());` and render `<html lang="en" className={inter.variable} style={style as React.CSSProperties}>`.

`apps/web/src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { homePath } from '@/server/nav';

export default async function Home() {
  const { ctx } = await requireContext();
  redirect(homePath(ctx));
}
```

`apps/web/src/app/(app)/layout.tsx`:

```tsx
import { isAgencyRole } from '@cs/core';
import { type ClientSummary, unreadCount } from '@cs/tools';
import { headers } from 'next/headers';
import { GuestBanner } from '@/components/shell/guest-banner';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { navFor } from '@/server/nav';
import { themeForViewer } from '@/server/theme';
import { callTool } from '@/server/tools';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { viewer, ctx } = await requireContext();
  const path = (await headers()).get('x-rm-path') ?? '/';
  const clientId = /^\/c\/([0-9a-f-]{36})/.exec(path)?.[1] ?? null;
  const { branding } = await themeForViewer(viewer);
  const clients = isAgencyRole(ctx.role) ? (await callTool<{ items: ClientSummary[] }>(ctx, 'list_clients', {})).items : [];
  const unread = await unreadCount(dbs().service, viewer.kind === 'guest' ? { contactId: viewer.contactId } : { userId: viewer.userId });
  return (
    <div className="flex min-h-screen">
      <Sidebar branding={branding} items={navFor(viewer, clientId)} active={path.split(/[?#]/)[0]!} />
      <div className="min-w-0 flex-1">
        {viewer.kind === 'guest' && <GuestBanner />}
        <TopBar viewer={viewer} clients={clients} currentClientId={clientId} unread={unread} />
        <main className="mx-auto flex max-w-[1560px] flex-col gap-5 px-7 pb-10 pt-6">{children}</main>
      </div>
    </div>
  );
}
```

Shell components, built to `docs/brand/mockups/01-client-overview.html` (open it in a browser while building):
- `sidebar.tsx` (server): 232px white column with `border-r`; logo at top (agency `logoUrl` image, else `Wordmark` — with the display name when it is not "Rival Monday"); nav links with lucide icons (`Users`, `LayoutDashboard`, `Send`, `Inbox`, `UserCog`, `Palette`, `Webhook`, `Bell` for the eight `icon` values); the active item (longest `href` that equals `active` or prefixes `active + '/'`) gets `bg-primary-soft text-primary-soft-text font-semibold`; agency display name at the bottom.
- `top-bar.tsx` (server): 68px white bar with `border-b`; left: `ClientSwitcher` for agency roles, the client name for client roles; right: `InboxBell`, `MembershipSwitcher` when `viewer.kind === 'user' && viewer.memberships.length > 1`, then the user's initials avatar with a `DropdownMenu` holding the email and `SignOutButton`. Guests get a "Sign in" link instead of the avatar.
- `client-switcher.tsx` (client): shadcn `Select` of `clients` (value `currentClientId`), `router.push('/c/' + id)` on change, placeholder "Choose a client".
- `membership-switcher.tsx` (server): `DropdownMenu` with one `<form action={switchMembership}>` per membership (hidden `membershipId`), label "{agencyName}" or "{agencyName} · {clientName}".
- `inbox-bell.tsx` (server): link to `/inbox` with a lucide `Bell`, a red dot when `unread > 0`, `aria-label={`Inbox, ${unread} unread`}`.
- `guest-banner.tsx` (server): full-width `bg-muted-surface` strip: "You are viewing this through an email link. Sign in for the full workspace." + link to `/sign-in`.

`apps/web/src/app/(app)/actions.ts`:

```ts
'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { MEMBERSHIP_COOKIE } from '@/server/viewer';

export async function switchMembership(formData: FormData) {
  const { viewer } = await requireContext();
  const id = String(formData.get('membershipId') ?? '');
  if (viewer.kind !== 'user' || !viewer.memberships.some((m) => m.id === id)) redirect('/');
  (await cookies()).set(MEMBERSHIP_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  redirect('/');
}
```

`apps/web/src/app/(app)/agency/page.tsx` — the 5a client list (5b turns it into the portfolio): `requireContext()`, `notFound()` for client roles, `callTool<{ items: ClientSummary[] }>(ctx, 'list_clients', {})`; render `h1` "Clients" and a `Table` (name linking to `/c/<id>`, vertical label via `{ hvac_plumbing: 'HVAC & plumbing', dental: 'Dental' }`, time zone). Empty state: "No clients yet. Client onboarding arrives in the next release."

`apps/web/src/app/(app)/c/[clientId]/page.tsx` — the 5a client home (5c replaces it with module 1):

```tsx
import type { AlertSummary, BriefSummary, ClientProfile, ReportSummary } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';
import Link from 'next/link';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export default async function ClientHome({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { ctx } = await requireContext();
  const profile = await callTool<ClientProfile>(ctx, 'get_client_profile', { clientId });
  const [briefs, alerts, reports] = await Promise.all([
    callTool<{ items: BriefSummary[] }>(ctx, 'list_briefs', { clientId, limit: 10 }),
    callTool<{ items: AlertSummary[] }>(ctx, 'list_alerts', { clientId, limit: 10 }),
    callTool<{ items: ReportSummary[] }>(ctx, 'list_trend_reports', { clientId }),
  ]);
  return (
    <>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-tight">{profile.name}</h1>
        <p className="mt-1 text-muted-foreground">Weekly briefs, alerts and quarterly reports.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Weekly briefs</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {briefs.items.length === 0 && <p className="text-muted-foreground">No briefs yet. The first one arrives on a Monday morning.</p>}
            {briefs.items.map((b) => (
              <Link key={b.id} href={`/c/${clientId}/briefs/${b.id}`} className="flex items-center gap-3 rounded-lg bg-muted-surface px-3 py-2 hover:bg-muted-surface-2">
                <span className="font-semibold">Week of {b.deliveryDate}</span>
                <span className="truncate text-muted-foreground">{b.summary}</span>
                <Badge variant="secondary" className="ml-auto">{b.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {alerts.items.length === 0 && <p className="text-muted-foreground">No alerts.</p>}
              {alerts.items.map((a) => (
                <Link key={a.id} href={`/c/${clientId}/alerts/${a.id}`} className="rounded-lg px-2 py-1 hover:bg-muted-surface">
                  <span className="font-semibold">{a.competitorName}</span> — {a.headline}
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Quarterly reports</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {reports.items.length === 0 && <p className="text-muted-foreground">The first report arrives after a full quarter.</p>}
              {reports.items.map((r) => <Link key={r.id} href={`/c/${clientId}/reports/${r.id}`} className="rounded-lg px-2 py-1 hover:bg-muted-surface">{r.quarter}</Link>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 5: Run tests, typecheck, build**

Run: `pnpm --filter @cs/web exec vitest run src/server/nav.test.ts src/server/tools.test.ts`, `pnpm --filter @cs/web typecheck`, `pnpm --filter @cs/web build` → PASS / success.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): per-agency themed shell, navigation, client list and client home"
```

---

### Task 14: Brief, alert and trend-report pages

**Files:**
- Create: `apps/web/src/components/views/brief-view.tsx`, `alert-view.tsx`, `report-view.tsx`; `apps/web/src/app/(app)/c/[clientId]/briefs/[briefId]/page.tsx`, `.../alerts/[alertId]/page.tsx`, `.../reports/[reportId]/page.tsx`
- Test: `apps/web/src/components/views/views.test.tsx`

**Interfaces:**
- Consumes: `BriefDetail`, `AlertDetail`, `ReportDetail` (Task 4); `changeTypeLabel` (`@cs/email`); `TrendReportData` (`@cs/db`).
- Produces: `BriefView({ brief, agency }: { brief: BriefDetail; agency: boolean })`, `AlertView({ alert, agency }: { alert: AlertDetail; agency: boolean })`, `ReportView({ report }: { report: ReportDetail })` — server components. Every page checks that the record's `clientId` equals the `[clientId]` route segment, else `notFound()`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/components/views/views.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { BriefDetail, ReportDetail } from '@cs/tools';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BriefView } from './brief-view';
import { ReportView } from './report-view';

const C = '00000000-0000-4000-8000-0000000000a1';
const item = (n: number, extra: Partial<BriefDetail['items'][number]> = {}): BriefDetail['items'][number] => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, ord: n, competitorId: C, competitorName: 'Smith HVAC', headline: `Headline ${n}`, whatChanged: 'W', whyItMatters: 'Y',
  recommendedAction: 'Do R', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1', 'e2'], status: 'active', upsellTag: null, ...extra,
});
const brief: BriefDetail = {
  id: '00000000-0000-4000-8000-0000000000b1', clientId: C, deliveryDate: '2026-10-12', status: 'sent', kind: 'standard', summary: 'Two moves this week.', sentAt: '2026-10-12T12:00:00Z',
  hasPdf: true, periodStart: '2026-10-02T00:00:00Z', periodEnd: '2026-10-09T00:00:00Z', approvedAt: '2026-10-10T00:00:00Z',
  items: [item(2), item(1, { upsellTag: 'ppc_audit' }), item(3, { status: 'dropped' })],
};

describe('BriefView', () => {
  it('renders active items in ord order with anchors and evidence counts', () => {
    const { container } = render(<BriefView brief={brief} agency={false} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Headline 1', 'Headline 2']);
    expect(container.querySelector('#item-00000000-0000-4000-8000-000000000001')).not.toBeNull();
    expect(screen.getAllByText(/2 evidence items/)).toHaveLength(2);
    expect(screen.queryByText(/ppc_audit/)).toBeNull();
    expect(screen.getByRole('link', { name: /download pdf/i }).getAttribute('href')).toBe(`/files/brief/${brief.id}`);
  });

  it('shows agency-only upsell tags and dropped items to agency roles', () => {
    render(<BriefView brief={brief} agency />);
    expect(screen.getByText(/ppc_audit/)).toBeTruthy();
    expect(screen.getByText('Headline 3')).toBeTruthy();
  });

  it('renders a quiet brief without items', () => {
    render(<BriefView brief={{ ...brief, kind: 'quiet', items: [], summary: 'No significant competitor moves this week.' }} agency={false} />);
    expect(screen.getByText('No significant competitor moves this week.')).toBeTruthy();
  });
});

describe('ReportView', () => {
  it('renders deterministic report numbers with readable change-type labels', () => {
    const report: ReportDetail = {
      id: '00000000-0000-4000-8000-0000000000c1', clientId: C, quarter: '2026-Q3', status: 'sent', sentAt: null, hasPdf: false, periodStart: '2026-07-01T00:00:00Z', periodEnd: '2026-09-30T00:00:00Z',
      data: { quarter: '2026-Q3', windowDays: 90, businesses: [{ competitorId: C, name: 'You', self: true, reviews: 40, avgRating: 4.7, prevAvgRating: 4.6, activeAds: null }], eventsByType: { price_change: 3 }, moves: [], briefsSent: 12, alertsDelivered: 2, recommendations: { created: 5, done: 2, inProgress: 1, dismissed: 1 } },
    };
    render(<ReportView report={report} />);
    const table = screen.getByRole('table', { name: /businesses/i });
    expect(within(table).getByText('You')).toBeTruthy();
    expect(screen.getByText(/price change/i)).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });
});
```

(`changeTypeLabel('price_change')` returns "Price change" — `packages/email/src/labels.ts`.)

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement the views**

`brief-view.tsx` — the item block follows mockup 01's `.item` (left border 3px primary, `bg-muted-surface`, `rounded-r-[10px]`; high-confidence ≥ 0.85 items use the accent border):

```tsx
import type { BriefDetail } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@cs/ui';

export function BriefView({ brief, agency }: { brief: BriefDetail; agency: boolean }) {
  const items = [...brief.items].filter((i) => agency || i.status === 'active').sort((a, b) => a.ord - b.ord);
  const deliverable = brief.status === 'approved' || brief.status === 'sent';
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <CardTitle className="text-[17px]">Week of {brief.deliveryDate}</CardTitle>
        {agency && <Badge variant="secondary">{brief.status}</Badge>}
        {deliverable && <a href={`/files/brief/${brief.id}`} className="ml-auto font-semibold text-primary-soft-text">Download PDF</a>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="leading-relaxed">{brief.summary}</p>
        {items.map((i) => (
          <article key={i.id} id={`item-${i.id}`} className={`rounded-r-[10px] border-l-[3px] bg-muted-surface px-3.5 py-3 ${i.confidence >= 0.85 ? 'border-accent' : 'border-primary'} ${i.status !== 'active' ? 'opacity-60' : ''}`}>
            <h3 className="mb-1.5 text-[15px] font-bold">{i.headline}</h3>
            <p className="my-1"><b>{i.competitorName}:</b> {i.whatChanged}</p>
            <p className="my-1">{i.whyItMatters}</p>
            <p className="my-1"><b className="text-secondary">Recommended:</b> {i.recommendedAction}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-soft-text">{i.evidenceIds.length} evidence items</span>
              {agency && i.upsellTag && <span className="rounded-md bg-[#FFF3DC] px-2 py-0.5 text-xs font-semibold text-accent-text">Upsell: {i.upsellTag}</span>}
              {agency && i.status !== 'active' && <Badge variant="outline">{i.status}</Badge>}
              <span className="ml-auto rounded-md bg-muted-surface-2 px-2 py-0.5 text-xs">Confidence {Math.round(i.confidence * 100)}%</span>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
```

(Evidence chips become links into the evidence viewer in 5c.)

`alert-view.tsx`: a `Card` with the competitor name, the headline as `h2`, the body paragraph, the delivered date (or created date), an `{n} evidence items` chip; for agency roles also a score badge, a status badge and — when `written === 'template'` — a muted note "Template text (the model text did not pass verification)".

`report-view.tsx`: `h2` "Competitor trends — {quarter}" and the period; a `<table aria-label="Businesses">` (name, reviews, average rating with ▲/▼ against `prevAvgRating`, active ads or "—"); a "Changes detected" list mapping `eventsByType` keys through `changeTypeLabel`; a moves list (type, competitor, status, first detected); a KPI row (briefs sent, alerts delivered, recommendations created/done/in progress/dismissed); "Download PDF" to `/files/report/<id>` when `status === 'sent'`. When `data` is null: "This report has no data."

- [ ] **Step 4: The pages**

`apps/web/src/app/(app)/c/[clientId]/briefs/[briefId]/page.tsx`:

```tsx
import { isAgencyRole } from '@cs/core';
import type { BriefDetail } from '@cs/tools';
import { notFound } from 'next/navigation';
import { BriefView } from '@/components/views/brief-view';
import { requireContext } from '@/server/current-viewer';
import { callTool } from '@/server/tools';

export default async function BriefPage({ params }: { params: Promise<{ clientId: string; briefId: string }> }) {
  const { clientId, briefId } = await params;
  const { ctx } = await requireContext();
  const brief = await callTool<BriefDetail>(ctx, 'get_brief', { briefId });
  if (brief.clientId !== clientId) notFound();
  return <BriefView brief={brief} agency={isAgencyRole(ctx.role)} />;
}
```

`alerts/[alertId]/page.tsx` and `reports/[reportId]/page.tsx` have the same shape with `get_alert` (`{ alertId }`) / `get_trend_report` (`{ reportId }`).

- [ ] **Step 5: Run tests and build** — `pnpm --filter @cs/web exec vitest run src/components/views` → PASS; `pnpm --filter @cs/web build`.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): brief, alert and trend-report pages"
```

---

### Task 15: Deep links — `/l/<token>` and `/go/<target>/<id>`

**Files:**
- Create: `apps/web/src/server/links.ts`, `apps/web/src/app/l/[token]/route.ts`, `apps/web/src/app/go/[target]/[id]/route.ts`
- Test: `apps/web/src/server/links.test.ts`

**Interfaces:**
- Consumes: `verifyLink`, `LINK_TARGETS`, `LinkTarget`, `isUuid`, `isAgencyRole` (`@cs/core`); `contact`, `brief`, `briefItem`, `alert`, `trendReport`, `withTenant` (`@cs/db`); `listMemberships` (`@cs/tools`); `signGuest`, `GUEST_COOKIE`, `GUEST_TTL_SECONDS`, `MEMBERSHIP_COOKIE` (Task 11).
- Produces:
  - `destinationPath(t: LinkTarget, id: string, clientId: string, briefIdForItem?: string): string` (decision 7)
  - `type LinkOutcome = { kind: 'redirect'; to: string; guest?: { contactId: string; agencyId: string; clientId: string }; membershipId?: string } | { kind: 'expired' } | { kind: 'other-account' } | { kind: 'sign-in'; next: string }`
  - `openLink(input: { service: Db; token: string; secrets: readonly string[]; sessionUserId: string | null; now?: Date }): Promise<LinkOutcome>`
  - `goDestination(app: Db, ctx: AccessContext, target: string, id: string): Promise<string | null>`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/links.test.ts`:

```ts
import { createAccessContext, signLink } from '@cs/core';
import { brief, briefItem, contact, membership } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { destinationPath, goDestination, openLink } from './links';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const S = 'k'.repeat(40);
const NOW = new Date('2026-10-05T12:00:00Z');
let clientContact = '';
let agencyContact = '';
let briefId = '';
let itemId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('u1', 'Pat', 'p@e.co', true), ('u2', 'Sam', 's@e.co', true)`);
  const [c] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, role: 'client_owner', email: 'p@e.co', userId: 'u1' }).returning();
  const [a] = await dbs.service.insert(contact).values({ agencyId: IDS.agencyA, role: 'account_manager', email: 'am@e.co' }).returning();
  clientContact = c!.id;
  agencyContact = a!.id;
  const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, deliveryDate: '2026-10-05', periodStart: NOW, periodEnd: NOW, status: 'sent' }).returning();
  briefId = b!.id;
  const [i] = await dbs.owner.insert(briefItem).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId, ord: 1, competitorId: IDS.competitorX, headline: 'h', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H' }).returning();
  itemId = i!.id;
});

const token = (sub: string, t: 'brief' | 'brief_item' = 'brief', id = briefId) => signLink(S, { sub, agency: IDS.agencyA, client: IDS.clientA1, t, id }, NOW);
const open = (tok: string, sessionUserId: string | null = null, now = NOW) => openLink({ service: dbs.service, token: tok, secrets: [S], sessionUserId, now });

describe('destinationPath', () => {
  it('maps every target (decision 7)', () => {
    expect(destinationPath('brief', 'B', 'C')).toBe('/c/C/briefs/B');
    expect(destinationPath('brief_item', 'I', 'C', 'B')).toBe('/c/C/briefs/B#item-I');
    expect(destinationPath('brief_pdf', 'B', 'C')).toBe('/files/brief/B');
    expect(destinationPath('alert', 'A', 'C')).toBe('/c/C/alerts/A');
    expect(destinationPath('trend_report', 'R', 'C')).toBe('/c/C/reports/R');
    expect(destinationPath('trend_report_pdf', 'R', 'C')).toBe('/files/report/R');
    expect(destinationPath('digest', 'X', 'C')).toBe('/inbox');
    expect(destinationPath('notifications', 'C', 'C')).toBe('/inbox');
  });
});

describe('openLink', () => {
  it('gives a client contact with no session a guest session', async () => {
    expect(await open(token(clientContact))).toEqual({ kind: 'redirect', to: `/c/${IDS.clientA1}/briefs/${briefId}`, guest: { contactId: clientContact, agencyId: IDS.agencyA, clientId: IDS.clientA1 } });
  });

  it('resolves brief items through their brief', async () => {
    expect(await open(token(clientContact, 'brief_item', itemId))).toMatchObject({ to: `/c/${IDS.clientA1}/briefs/${briefId}#item-${itemId}` });
  });

  it('sends agency contacts to sign in instead of a guest session', async () => {
    expect(await open(token(agencyContact))).toEqual({ kind: 'sign-in', next: `/c/${IDS.clientA1}/briefs/${briefId}` });
  });

  it('redirects the contact’s own signed-in user, selecting a matching membership', async () => {
    const [m] = await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1, contactId: clientContact, createdBy: 't' }).returning();
    expect(await open(token(clientContact), 'u1')).toEqual({ kind: 'redirect', to: `/c/${IDS.clientA1}/briefs/${briefId}`, membershipId: m!.id });
  });

  it('refuses to act for a different signed-in user (Review Focus 1)', async () => {
    expect(await open(token(clientContact), 'u2')).toEqual({ kind: 'other-account' });
  });

  it('expires tampered, out-of-date, revoked, inactive and cross-agency links (Review Focus 3)', async () => {
    expect(await open(`${token(clientContact)}x`)).toEqual({ kind: 'expired' });
    expect(await open(token(clientContact), null, new Date('2026-11-05T12:00:01Z'))).toEqual({ kind: 'expired' });
    await dbs.service.update(contact).set({ linksRevokedBefore: new Date('2026-10-05T12:00:01Z') }).where(eq(contact.id, clientContact));
    expect(await open(token(clientContact))).toEqual({ kind: 'expired' });
    await dbs.service.update(contact).set({ linksRevokedBefore: null, active: false }).where(eq(contact.id, clientContact));
    expect(await open(token(clientContact))).toEqual({ kind: 'expired' });
    const crossAgency = signLink(S, { sub: agencyContact, agency: IDS.agencyB, client: IDS.clientB1, t: 'brief', id: briefId }, NOW);
    expect(await open(crossAgency)).toEqual({ kind: 'expired' });
  });

  it('expires a brief_item link whose item is not in the token’s client', async () => {
    expect(await open(token(clientContact, 'brief_item', IDS.clientA2))).toEqual({ kind: 'expired' });
  });
});

describe('goDestination', () => {
  const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'a', role: 'agency_admin', clientScope: 'all', features: [] });
  const otherAgency = createAccessContext({ agencyId: IDS.agencyB, userId: 'b', role: 'agency_admin', clientScope: 'all', features: [] });
  it('finds the client through RLS-visible rows', async () => {
    expect(await goDestination(dbs.app, admin, 'brief', briefId)).toBe(`/c/${IDS.clientA1}/briefs/${briefId}`);
    expect(await goDestination(dbs.app, admin, 'brief_item', itemId)).toBe(`/c/${IDS.clientA1}/briefs/${briefId}#item-${itemId}`);
    expect(await goDestination(dbs.app, admin, 'notifications', IDS.clientA1)).toBe('/inbox');
  });
  it('returns null for other tenants, unknown targets and malformed ids', async () => {
    expect(await goDestination(dbs.app, otherAgency, 'brief', briefId)).toBeNull();
    expect(await goDestination(dbs.app, admin, 'evil', briefId)).toBeNull();
    expect(await goDestination(dbs.app, admin, 'brief', 'not-a-uuid')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `links.ts`**

```ts
import { type AccessContext, isAgencyRole, isUuid, LINK_TARGETS, type LinkTarget, verifyLink } from '@cs/core';
import { alert, brief, briefItem, contact, type Db, trendReport, withTenant } from '@cs/db';
import { listMemberships } from '@cs/tools';
import { and, eq } from 'drizzle-orm';

export function destinationPath(t: LinkTarget, id: string, clientId: string, briefIdForItem?: string): string {
  switch (t) {
    case 'brief': return `/c/${clientId}/briefs/${id}`;
    case 'brief_item': return `/c/${clientId}/briefs/${briefIdForItem}#item-${id}`;
    case 'brief_pdf': return `/files/brief/${id}`;
    case 'alert': return `/c/${clientId}/alerts/${id}`;
    case 'trend_report': return `/c/${clientId}/reports/${id}`;
    case 'trend_report_pdf': return `/files/report/${id}`;
    case 'digest':
    case 'notifications': return '/inbox';
  }
}

export type LinkOutcome =
  | { kind: 'redirect'; to: string; guest?: { contactId: string; agencyId: string; clientId: string }; membershipId?: string }
  | { kind: 'expired' }
  | { kind: 'other-account' }
  | { kind: 'sign-in'; next: string };

/** Decision 6 + 4b obligation: verify, refuse revoked/inactive/mismatched contacts, map sub → session, redirect by target. */
export async function openLink(input: { service: Db; token: string; secrets: readonly string[]; sessionUserId: string | null; now?: Date }): Promise<LinkOutcome> {
  const now = input.now ?? new Date();
  const claims = verifyLink(input.secrets, input.token, now);
  if (!claims || ![claims.sub, claims.agency, claims.client, claims.id].every(isUuid)) return { kind: 'expired' };
  const [c] = await input.service.select().from(contact).where(eq(contact.id, claims.sub));
  if (!c || !c.active || c.agencyId !== claims.agency || (c.clientId !== null && c.clientId !== claims.client)) return { kind: 'expired' };
  if (c.linksRevokedBefore && claims.iat * 1000 < c.linksRevokedBefore.getTime()) return { kind: 'expired' };

  let itemBrief: string | undefined;
  if (claims.t === 'brief_item') {
    const [row] = await input.service.select({ briefId: briefItem.briefId }).from(briefItem).where(and(eq(briefItem.id, claims.id), eq(briefItem.clientId, claims.client)));
    if (!row) return { kind: 'expired' };
    itemBrief = row.briefId;
  }
  const to = destinationPath(claims.t, claims.id, claims.client, itemBrief);

  if (input.sessionUserId) {
    if (c.userId !== input.sessionUserId) return { kind: 'other-account' };
    const memberships = await listMemberships(input.service, input.sessionUserId);
    const m = memberships.find((x) => x.agencyId === claims.agency && (x.clientId === claims.client || (isAgencyRole(x.role) && (x.clientScope === null || x.clientScope.includes(claims.client)))));
    return m ? { kind: 'redirect', to, membershipId: m.id } : { kind: 'redirect', to };
  }
  if (c.clientId === null) return { kind: 'sign-in', next: to };
  return { kind: 'redirect', to, guest: { contactId: c.id, agencyId: claims.agency, clientId: claims.client } };
}

/** Webhook links (Slack/Teams) carry no token: resolve the client through what this viewer may see. */
export async function goDestination(app: Db, ctx: AccessContext, target: string, id: string): Promise<string | null> {
  if (!(LINK_TARGETS as readonly string[]).includes(target) || !isUuid(id)) return null;
  const t = target as LinkTarget;
  if (t === 'notifications' || t === 'digest') return '/inbox';
  return withTenant(app, ctx, async (tx) => {
    if (t === 'brief' || t === 'brief_pdf') {
      const [b] = await tx.select({ clientId: brief.clientId }).from(brief).where(eq(brief.id, id));
      return b ? destinationPath(t, id, b.clientId) : null;
    }
    if (t === 'brief_item') {
      const [i] = await tx.select({ clientId: briefItem.clientId, briefId: briefItem.briefId }).from(briefItem).where(eq(briefItem.id, id));
      return i ? destinationPath(t, id, i.clientId, i.briefId) : null;
    }
    if (t === 'alert') {
      const [a] = await tx.select({ clientId: alert.clientId }).from(alert).where(eq(alert.id, id));
      return a ? destinationPath(t, id, a.clientId) : null;
    }
    const [r] = await tx.select({ clientId: trendReport.clientId }).from(trendReport).where(eq(trendReport.id, id));
    return r ? destinationPath(t, id, r.clientId) : null;
  });
}
```

- [ ] **Step 4: The route handlers**

`apps/web/src/app/l/[token]/route.ts`:

```ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { GUEST_COOKIE, GUEST_TTL_SECONDS, signGuest } from '@/server/guest';
import { openLink } from '@/server/links';
import { MEMBERSHIP_COOKIE } from '@/server/viewer';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const env = webEnv();
  const session = await auth().api.getSession({ headers: await headers() });
  const outcome = await openLink({ service: dbs().service, token, secrets: env.linkSecrets, sessionUserId: session?.user.id ?? null });
  const at = (path: string) => new URL(path, env.appUrl);
  const secure = env.appUrl.startsWith('https://');
  let res: NextResponse;
  if (outcome.kind === 'expired') res = NextResponse.redirect(at('/link-expired'));
  else if (outcome.kind === 'other-account') res = NextResponse.redirect(at('/link-other-account'));
  else if (outcome.kind === 'sign-in') res = NextResponse.redirect(at(`/sign-in?next=${encodeURIComponent(outcome.next)}`));
  else {
    res = NextResponse.redirect(at(outcome.to));
    if (outcome.guest) res.cookies.set(GUEST_COOKIE, signGuest(env.linkSecrets[0]!, outcome.guest), { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: GUEST_TTL_SECONDS });
    if (outcome.membershipId) res.cookies.set(MEMBERSHIP_COOKIE, outcome.membershipId, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  // The token is in the URL: never cache it or pass it on as a referrer.
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
```

`apps/web/src/app/go/[target]/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { goDestination } from '@/server/links';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ target: string; id: string }> }) {
  const { target, id } = await params;
  const env = webEnv();
  const viewer = await getViewer();
  if (!viewer || viewer.kind !== 'user') {
    return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(`/go/${target}/${id}`)}`, env.appUrl));
  }
  const to = await goDestination(dbs().app, viewer.ctx, target, id);
  return to ? NextResponse.redirect(new URL(to, env.appUrl)) : new NextResponse('Not found', { status: 404 });
}
```

`/go/` stays out of `proxy.ts`'s public list: the proxy's redirect to sign-in carries the same `next`.

- [ ] **Step 5: Run tests and build** — `pnpm --filter @cs/web exec vitest run src/server/links.test.ts` → PASS; typecheck; build.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): signed /l deep links with guest sessions and /go webhook links"
```

---

### Task 16: PDF downloads with on-demand rendering

**Files:**
- Create: `apps/web/src/server/files.ts`, `apps/web/src/server/queue.ts`, `apps/web/src/app/files/brief/[id]/route.ts`, `apps/web/src/app/files/report/[id]/route.ts`
- Test: `apps/web/src/server/files.test.ts`

**Interfaces:**
- Consumes: `get_brief`, `get_trend_report` tools; `brief`, `trendReport` (`@cs/db`); `ObjectStore`, `createStoreFromEnv`, the memory store factory (`@cs/storage`).
- Produces:
  - `resolveEvidenceDir(dir: string | undefined, webCwd: string): string | undefined` — relative paths resolve against `<webCwd>/../worker` (decision 8)
  - `webStore(): ObjectStore`
  - `type Enqueue = (job: 'brief-pdf' | 'report-pdf', payload: { briefId: string } | { reportId: string }, singletonKey: string) => Promise<void>`
  - `enqueue: Enqueue` (in `queue.ts`: pg-boss, lazily started, enqueue-only)
  - `servePdf(input: { kind: 'brief' | 'report'; id: string; ctx: AccessContext; registry: ToolRegistry<ToolDeps>; service: Db; store: ObjectStore; enqueue: Enqueue }): Promise<Response>`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/files.test.ts` (`createMemoryStore` is exported by `packages/storage/src/memory.ts`):

```ts
import { createAccessContext } from '@cs/core';
import { brief, trendReport } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { createToolRegistry } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveEvidenceDir, servePdf } from './files';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const registry = createToolRegistry({ app: dbs.app, service: dbs.service }, { audit: { record: async () => {} } });
const owner = createAccessContext({ agencyId: IDS.agencyA, userId: 'o', role: 'client_owner', clientScope: [IDS.clientA1], features: [] });
const otherAgency = createAccessContext({ agencyId: IDS.agencyB, userId: 'b', role: 'agency_admin', clientScope: 'all', features: [] });
const NOW = new Date('2026-10-05T12:00:00Z');
let sentId = '';
let readyId = '';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const base = { agencyId: IDS.agencyA, clientId: IDS.clientA1, periodStart: NOW, periodEnd: NOW };
  const [s] = await dbs.owner.insert(brief).values({ ...base, deliveryDate: '2026-10-05', status: 'sent', sentAt: NOW }).returning();
  const [r] = await dbs.owner.insert(brief).values({ ...base, deliveryDate: '2026-10-12', status: 'ready' }).returning();
  sentId = s!.id;
  readyId = r!.id;
});

function serve(kind: 'brief' | 'report', id: string, ctx = owner, store = createMemoryStore()) {
  const enqueue = vi.fn(async () => {});
  return { res: servePdf({ kind, id, ctx, registry, service: dbs.service, store, enqueue }), enqueue };
}

describe('servePdf', () => {
  it('streams a stored PDF inline', async () => {
    const store = createMemoryStore();
    const key = `briefs/${IDS.agencyA}/${sentId}.pdf`;
    await store.put(key, new Uint8Array([37, 80, 68, 70]), 'application/pdf');
    await dbs.owner.update(brief).set({ pdfKey: key }).where(eq(brief.id, sentId));
    const r = await serve('brief', sentId, owner, store).res;
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-disposition')).toBe('inline; filename="brief-2026-10-05.pdf"');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it('enqueues a render and returns a refreshing page when no PDF exists yet', async () => {
    const { res, enqueue } = serve('brief', sentId);
    const r = await res;
    expect(r.status).toBe(202);
    expect(r.headers.get('refresh')).toBe('5');
    expect(await r.text()).toMatch(/preparing/i);
    expect(enqueue).toHaveBeenCalledWith('brief-pdf', { briefId: sentId }, sentId);
  });

  it('re-renders when the key is set but the object is missing', async () => {
    await dbs.owner.update(brief).set({ pdfKey: `briefs/${IDS.agencyA}/${sentId}.pdf` }).where(eq(brief.id, sentId));
    const { res, enqueue } = serve('brief', sentId);
    expect((await res).status).toBe(202);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('404s for drafts, other tenants and unknown ids — without enqueueing', async () => {
    const cases: [string, typeof owner][] = [[readyId, owner], [sentId, otherAgency], ['00000000-0000-4000-8000-000000000999', owner], ['nope', owner]];
    for (const [id, ctx] of cases) {
      const { res, enqueue } = serve('brief', id, ctx);
      expect((await res).status).toBe(404);
      expect(enqueue).not.toHaveBeenCalled();
    }
  });

  it('serves reports only once sent', async () => {
    const [rep] = await dbs.owner.insert(trendReport).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, quarter: '2026-Q3', periodStart: NOW, periodEnd: NOW, status: 'ready' }).returning();
    const admin = createAccessContext({ agencyId: IDS.agencyA, userId: 'a', role: 'agency_admin', clientScope: 'all', features: [] });
    expect((await serve('report', rep!.id, admin).res).status).toBe(404);
  });
});

describe('resolveEvidenceDir', () => {
  it('resolves relative dirs against the worker app and keeps absolute ones', () => {
    expect(resolveEvidenceDir('./.evidence', '/repo/apps/web')).toMatch(/[\\/]repo[\\/]apps[\\/]worker[\\/]\.evidence$/);
    expect(resolveEvidenceDir('/data/evidence', '/repo/apps/web')).toMatch(/[\\/]data[\\/]evidence$/);
    expect(resolveEvidenceDir(undefined, '/repo/apps/web')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/server/files.ts` (no `server-only`, so tests import it; `webStore` reads env lazily):

```ts
import { isAbsolute, resolve } from 'node:path';
import { type AccessContext, isUuid, ToolError, type ToolRegistry } from '@cs/core';
import { brief, type Db, trendReport } from '@cs/db';
import { createStoreFromEnv, type ObjectStore } from '@cs/storage';
import type { BriefDetail, ReportDetail, ToolDeps } from '@cs/tools';
import { eq } from 'drizzle-orm';

export type Enqueue = (job: 'brief-pdf' | 'report-pdf', payload: { briefId: string } | { reportId: string }, singletonKey: string) => Promise<void>;

export function resolveEvidenceDir(dir: string | undefined, webCwd: string): string | undefined {
  if (!dir) return undefined;
  return isAbsolute(dir) ? resolve(dir) : resolve(webCwd, '..', 'worker', dir);
}

let store: ObjectStore | null = null;
export const webStore = () => (store ??= createStoreFromEnv({ ...process.env, EVIDENCE_FS_DIR: resolveEvidenceDir(process.env.EVIDENCE_FS_DIR, process.cwd()) }));

const notFound = () => new Response('Not found', { status: 404 });
const preparing = () =>
  new Response('<!doctype html><meta charset="utf-8"><title>Preparing PDF</title><body style="font-family:system-ui;padding:40px">Preparing your PDF… this page refreshes automatically.</body>', {
    status: 202, headers: { 'content-type': 'text/html; charset=utf-8', refresh: '5', 'cache-control': 'no-store' },
  });

async function locate(input: Parameters<typeof servePdf>[0]): Promise<{ key: string | null; filename: string } | null> {
  if (input.kind === 'brief') {
    const b = (await input.registry.invoke(input.ctx, 'get_brief', { briefId: input.id })) as BriefDetail;
    if (b.status !== 'approved' && b.status !== 'sent') return null;
    const [row] = await input.service.select({ key: brief.pdfKey }).from(brief).where(eq(brief.id, input.id));
    return { key: row?.key ?? null, filename: `brief-${b.deliveryDate}.pdf` };
  }
  const r = (await input.registry.invoke(input.ctx, 'get_trend_report', { reportId: input.id })) as ReportDetail;
  if (r.status !== 'sent') return null;
  const [row] = await input.service.select({ key: trendReport.pdfKey }).from(trendReport).where(eq(trendReport.id, input.id));
  return { key: row?.key ?? null, filename: `competitor-trends-${r.quarter}.pdf` };
}

/** Decision 8 + 4b obligation: stream the stored PDF, or render it on demand. Access is checked through the read tools. */
export async function servePdf(input: { kind: 'brief' | 'report'; id: string; ctx: AccessContext; registry: ToolRegistry<ToolDeps>; service: Db; store: ObjectStore; enqueue: Enqueue }): Promise<Response> {
  if (!isUuid(input.id)) return notFound();
  let found: { key: string | null; filename: string } | null;
  try {
    found = await locate(input);
  } catch (e) {
    if (e instanceof ToolError && e.code !== 'internal') return notFound();
    throw e;
  }
  if (!found) return notFound();
  const bytes = found.key ? await input.store.get(found.key) : null;
  if (!bytes) {
    if (input.kind === 'brief') await input.enqueue('brief-pdf', { briefId: input.id }, input.id);
    else await input.enqueue('report-pdf', { reportId: input.id }, input.id);
    return preparing();
  }
  return new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${found.filename}"`, 'cache-control': 'private, no-store' } });
}
```

`apps/web/src/server/queue.ts` — mirror how `apps/worker/src/boss.ts` imports and constructs `PgBoss` (pg-boss 10 option names):

```ts
import 'server-only';
import PgBoss from 'pg-boss';
import { webEnv } from './env';
import type { Enqueue } from './files';

let started: Promise<PgBoss> | null = null;

/** Enqueue only: the worker owns queue creation, schedules and maintenance. */
function boss(): Promise<PgBoss> {
  started ??= (async () => {
    const b = new PgBoss({ connectionString: webEnv().queueDatabaseUrl, supervise: false, schedule: false, migrate: false, max: 2 });
    b.on('error', (e) => console.error('[web queue]', e));
    await b.start();
    return b;
  })();
  return started;
}

export const enqueue: Enqueue = async (job, payload, singletonKey) => {
  await (await boss()).send(job, payload, { singletonKey });
};
```

The worker's `short` policy on these queues dedupes by `singletonKey`, so repeated refreshes don't pile up renders. The queues exist once the worker has started at least once against that database.

`apps/web/src/app/files/brief/[id]/route.ts`:

```ts
import { getViewer } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { servePdf, webStore } from '@/server/files';
import { enqueue } from '@/server/queue';
import { registry } from '@/server/tools';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer || viewer.kind === 'member-less') return new Response('Not found', { status: 404 });
  return servePdf({ kind: 'brief', id, ctx: viewer.ctx, registry: registry(), service: dbs().service, store: webStore(), enqueue });
}
```

`files/report/[id]/route.ts` is the same with `kind: 'report'`.

- [ ] **Step 4: Run tests and build** — `pnpm --filter @cs/web exec vitest run src/server/files.test.ts` → PASS; typecheck; build.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): brief and report PDF downloads with on-demand rendering"
```

---

### Task 17: Inbox page and personal notification settings

**Files:**
- Create: `apps/web/src/server/inbox.ts`, `apps/web/src/app/(app)/inbox/{page.tsx,actions.ts}`, `apps/web/src/app/(app)/settings/notifications/{page.tsx,actions.ts,pref-switch.tsx,contact-form.tsx}`
- Test: `apps/web/src/server/inbox.test.ts`

**Interfaces:**
- Consumes: Task 5 functions; `Viewer` (Task 11).
- Produces:
  - `inboxOwnerFor(v: Exclude<Viewer, { kind: 'member-less' }>): InboxOwner`
  - `internalLink(link: string | null, appUrl: string): string` — path+search+hash when the link is on `appUrl`'s origin, else `'/inbox'`
  - Server actions: `openNotification(formData)` (field `id`), `markAllReadAction()`, `setPrefAction(input: { contactId: string; kind: string; channel: 'in_app' | 'email'; enabled: boolean })`, `updateContactAction(prev, formData)` (fields `contactId`, `timezone`, `quietStart`, `quietEnd`) → `{ error: string | null }`
  - Client components `PrefSwitch({ contactId, kind, channel, enabled, label })`, `ContactForm({ contactId, timezone, quietHours })`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/inbox.test.ts`:

```ts
import { createAccessContext } from '@cs/core';
import type { MembershipSummary } from '@cs/tools';
import { describe, expect, it } from 'vitest';
import { inboxOwnerFor, internalLink } from './inbox';

const ctx = createAccessContext({ agencyId: '00000000-0000-4000-8000-00000000000a', userId: 'u', role: 'client_viewer', clientScope: ['00000000-0000-4000-8000-0000000000a1'], features: [] });

describe('inboxOwnerFor', () => {
  it('uses the contact for guests and the user otherwise', () => {
    expect(inboxOwnerFor({ kind: 'guest', contactId: 'c1', ctx })).toEqual({ contactId: 'c1' });
    expect(inboxOwnerFor({ kind: 'user', userId: 'u', email: 'e', name: 'n', ctx, membership: {} as MembershipSummary, memberships: [] })).toEqual({ userId: 'u' });
  });
});

describe('internalLink', () => {
  it('keeps our own links and drops foreign ones', () => {
    expect(internalLink('https://rm.nofingers.ai/l/abc.def', 'https://rm.nofingers.ai')).toBe('/l/abc.def');
    expect(internalLink('https://evil.example/l/abc', 'https://rm.nofingers.ai')).toBe('/inbox');
    expect(internalLink(null, 'https://rm.nofingers.ai')).toBe('/inbox');
    expect(internalLink('not a url', 'https://rm.nofingers.ai')).toBe('/inbox');
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/server/inbox.ts`:

```ts
import type { InboxOwner } from '@cs/tools';
import type { Viewer } from './viewer';

export const inboxOwnerFor = (v: Exclude<Viewer, { kind: 'member-less' }>): InboxOwner => (v.kind === 'guest' ? { contactId: v.contactId } : { userId: v.userId });

export function internalLink(link: string | null, appUrl: string): string {
  if (!link) return '/inbox';
  try {
    const u = new URL(link);
    return u.origin === new URL(appUrl).origin ? `${u.pathname}${u.search}${u.hash}` : '/inbox';
  } catch {
    return '/inbox';
  }
}
```

`apps/web/src/app/(app)/inbox/actions.ts`:

```ts
'use server';
import { listInbox, markAllRead, markRead } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { webEnv } from '@/server/env';
import { inboxOwnerFor, internalLink } from '@/server/inbox';

export async function openNotification(formData: FormData) {
  const { viewer } = await requireContext();
  const owner = inboxOwnerFor(viewer);
  const id = String(formData.get('id') ?? '');
  const item = (await listInbox(dbs().service, owner, { limit: 200 })).find((n) => n.id === id);
  if (!item) redirect('/inbox');
  await markRead(dbs().service, owner, id);
  redirect(internalLink(item.link, webEnv().appUrl));
}

export async function markAllReadAction() {
  const { viewer } = await requireContext();
  await markAllRead(dbs().service, inboxOwnerFor(viewer));
  revalidatePath('/inbox');
}
```

The in-app `link` is the recipient's own signed `/l/` URL (4b `notify`); following it while signed in as that contact's user takes Task 15's same-user path straight to the target.

`apps/web/src/app/(app)/inbox/page.tsx`: `requireContext()`, `listInbox(dbs().service, inboxOwnerFor(viewer), { limit: 100 })`; a card with a header ("Inbox" + a `<form action={markAllReadAction}>` "Mark all read" button) and one row per item — a `<form action={openNotification}>` with a hidden `id` and a full-width button showing the title (bold when unread), the body on one truncated line, a kind label and the date. Empty state: "Nothing here yet. Alerts, briefs and reports you receive also appear here."

`apps/web/src/app/(app)/settings/notifications/actions.ts`:

```ts
'use server';
import type { NotificationKind } from '@cs/db';
import { setMyNotificationPref, updateMyContact } from '@cs/tools';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';

async function userId(): Promise<string> {
  const { viewer } = await requireContext();
  if (viewer.kind !== 'user') notFound();
  return viewer.userId;
}

export async function setPrefAction(input: { contactId: string; kind: string; channel: 'in_app' | 'email'; enabled: boolean }) {
  await setMyNotificationPref(dbs().service, await userId(), { ...input, kind: input.kind as NotificationKind });
  revalidatePath('/settings/notifications');
}

export async function updateContactAction(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const start = String(formData.get('quietStart') ?? '');
  const end = String(formData.get('quietEnd') ?? '');
  try {
    await updateMyContact(dbs().service, await userId(), {
      contactId: String(formData.get('contactId') ?? ''),
      timezone: String(formData.get('timezone') ?? ''),
      quietHours: start && end ? { start, end } : null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save' };
  }
  revalidatePath('/settings/notifications');
  return { error: null };
}
```

`pref-switch.tsx` (client): shadcn `Switch` with optimistic `checked` state that calls `setPrefAction` inside `useTransition`; `aria-label={label}`.

`contact-form.tsx` (client): `useActionState(updateContactAction, { error: null })`; hidden `contactId`; a time-zone `<select name="timezone">` (first option "Business time zone" with value `""`, then `Intl.supportedValuesOf('timeZone')`); two `type="time"` inputs `quietStart`/`quietEnd` with the hint "No notifications by email in this window (in-app still arrive)"; Save button; shows `state.error` in a `role="alert"` paragraph.

`settings/notifications/page.tsx`: guests → `notFound()`. `myNotificationSettings(dbs().service, viewer.userId)`; one card per entry titled `clientName ?? agencyName`; a table of kinds (labels: alert "Instant alerts", alert_digest "Alert digest", brief "Weekly brief", trend_report "Quarterly report", am_alert "Client alerts (agency)", brief_ready "Brief ready for review", brief_failed "Brief failed", brief_overdue "Brief overdue") × columns "In-app" / "Email" with `PrefSwitch`; then `ContactForm`. Empty state for a user with no active contact: "You have no notification settings yet."

- [ ] **Step 4: Run tests and build** — `pnpm --filter @cs/web exec vitest run src/server/inbox.test.ts` → PASS; typecheck; build.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): in-app inbox and personal notification settings"
```

---

### Task 18: Agency settings screens and the admin CLI

**Files:**
- Create: `apps/web/src/server/forms.ts`; `apps/web/src/app/(app)/agency/team/{page.tsx,actions.ts,invite-form.tsx}`; `apps/web/src/app/(app)/agency/branding/{page.tsx,actions.ts,branding-form.tsx}`; `apps/web/src/app/(app)/agency/webhooks/{page.tsx,actions.ts}`; `apps/web/src/app/(app)/c/[clientId]/settings/delivery/{page.tsx,actions.ts}`; `apps/web/scripts/admin.ts`, `apps/web/scripts/admin-args.ts`
- Modify: `apps/web/vitest.config.ts` (`include` also `scripts/**/*.test.ts`)
- Test: `apps/web/src/server/forms.test.ts`, `apps/web/scripts/admin-args.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 6; `signLink`, `LINK_TARGETS`, `ROLES` (`@cs/core`).
- Produces:
  - `type FormResult = { ok: true; message?: string } | { ok: false; error: string }`
  - `parseInviteForm(fd: FormData): { email: string; role: Role; clientId: string | null; clientScope: string[] | null } | { error: string }`
  - `parseBrandingForm(fd: FormData): AgencyBranding`
  - `parseDeliveryForm(fd: FormData): { alertMode: AlertMode; briefAutoSend: boolean; timezone?: string } | { error: string }`
  - `toFormResult(e: unknown): FormResult` (non-internal `ToolError` → `{ ok: false }`; anything else is rethrown)
  - `type AdminCommand = { cmd: 'agencies' } | { cmd: 'create-agency'; name: string } | { cmd: 'invite'; agency: string; email: string; role: Role; client?: string } | { cmd: 'link'; contact: string; target: LinkTarget; id: string; client?: string }`; `parseAdminArgs(argv: string[]): AdminCommand | { error: string }`; `ADMIN_USAGE`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/server/forms.test.ts`:

```ts
import { ToolError } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { parseBrandingForm, parseDeliveryForm, parseInviteForm, toFormResult } from './forms';

const fd = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const C1 = '00000000-0000-4000-8000-0000000000a1';

describe('parseInviteForm', () => {
  it('parses agency and client invitations', () => {
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'agency_admin' }))).toEqual({ email: 'a@b.co', role: 'agency_admin', clientId: null, clientScope: null });
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'client_viewer', clientId: C1 }))).toMatchObject({ clientId: C1 });
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'account_manager', scope: [C1] }))).toMatchObject({ clientScope: [C1] });
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'account_manager' }))).toMatchObject({ clientScope: null });
  });
  it('rejects unknown roles', () => {
    expect(parseInviteForm(fd({ email: 'a@b.co', role: 'root' }))).toEqual({ error: 'Choose a role' });
  });
});

describe('parseBrandingForm', () => {
  it('keeps only known, non-empty fields', () => {
    expect(parseBrandingForm(fd({ displayName: 'Acme', primary: '#123456', signOff: '', evil: 'x' }))).toEqual({ displayName: 'Acme', primary: '#123456' });
  });
});

describe('parseDeliveryForm', () => {
  it('parses mode, auto-send checkbox and timezone', () => {
    expect(parseDeliveryForm(fd({ alertMode: 'direct', briefAutoSend: 'on', timezone: 'America/Denver' }))).toEqual({ alertMode: 'direct', briefAutoSend: true, timezone: 'America/Denver' });
    expect(parseDeliveryForm(fd({ alertMode: 'digest_only' }))).toEqual({ alertMode: 'digest_only', briefAutoSend: false });
    expect(parseDeliveryForm(fd({ alertMode: 'loud' }))).toEqual({ error: 'Choose an alert mode' });
  });
});

describe('toFormResult', () => {
  it('turns tool errors into messages and rethrows others', () => {
    expect(toFormResult(new ToolError('invalid_input', 'Bad'))).toEqual({ ok: false, error: 'Bad' });
    expect(toFormResult(new ToolError('not_found', 'x'))).toEqual({ ok: false, error: 'Not found' });
    expect(() => toFormResult(new Error('boom'))).toThrow('boom');
  });
});
```

`apps/web/scripts/admin-args.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseAdminArgs } from './admin-args';

const A = '00000000-0000-4000-8000-00000000000a';

describe('parseAdminArgs', () => {
  it('parses each command', () => {
    expect(parseAdminArgs(['agencies'])).toEqual({ cmd: 'agencies' });
    expect(parseAdminArgs(['create-agency', '--name', 'Acme'])).toEqual({ cmd: 'create-agency', name: 'Acme' });
    expect(parseAdminArgs(['invite', '--agency', A, '--email', 'x@y.co', '--role', 'agency_admin'])).toEqual({ cmd: 'invite', agency: A, email: 'x@y.co', role: 'agency_admin' });
    expect(parseAdminArgs(['link', '--contact', A, '--target', 'brief', '--id', A])).toEqual({ cmd: 'link', contact: A, target: 'brief', id: A });
    expect(parseAdminArgs(['link', '--contact', A, '--target', 'brief', '--id', A, '--client', A])).toMatchObject({ client: A });
  });
  it('reports bad input', () => {
    expect(parseAdminArgs([])).toHaveProperty('error');
    expect(parseAdminArgs(['invite', '--agency', 'x', '--email', 'x@y.co', '--role', 'agency_admin'])).toHaveProperty('error');
    expect(parseAdminArgs(['link', '--contact', A, '--target', 'nope', '--id', A])).toHaveProperty('error');
    expect(parseAdminArgs(['agencies', '--bogus'])).toHaveProperty('error');
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `forms.ts`, `admin-args.ts`, `admin.ts`**

`apps/web/src/server/forms.ts`:

```ts
import { isUuid, type Role, ROLES, ToolError } from '@cs/core';
import type { AgencyBranding, AlertMode } from '@cs/db';

export type FormResult = { ok: true; message?: string } | { ok: false; error: string };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export function parseInviteForm(fd: FormData): { email: string; role: Role; clientId: string | null; clientScope: string[] | null } | { error: string } {
  const role = str(fd, 'role');
  if (!(ROLES as readonly string[]).includes(role)) return { error: 'Choose a role' };
  const scope = fd.getAll('scope').map(String).filter(isUuid);
  return { email: str(fd, 'email'), role: role as Role, clientId: str(fd, 'clientId') || null, clientScope: role === 'account_manager' && scope.length ? scope : null };
}

/** The accent is not overridable (brand.md), so it has no form field. */
const BRANDING_FIELDS = ['displayName', 'logoUrl', 'primary', 'secondary', 'fromName', 'signOff'] as const;
export function parseBrandingForm(fd: FormData): AgencyBranding {
  const out: AgencyBranding = {};
  for (const k of BRANDING_FIELDS) {
    const v = str(fd, k);
    if (v) out[k] = v;
  }
  return out;
}

const MODES: AlertMode[] = ['direct', 'after_am_check', 'digest_only'];
export function parseDeliveryForm(fd: FormData): { alertMode: AlertMode; briefAutoSend: boolean; timezone?: string } | { error: string } {
  const mode = str(fd, 'alertMode');
  if (!MODES.includes(mode as AlertMode)) return { error: 'Choose an alert mode' };
  const tz = str(fd, 'timezone');
  return { alertMode: mode as AlertMode, briefAutoSend: fd.get('briefAutoSend') === 'on', ...(tz ? { timezone: tz } : {}) };
}

export function toFormResult(e: unknown): FormResult {
  if (e instanceof ToolError && e.code !== 'internal') return { ok: false, error: e.code === 'invalid_input' ? e.message : 'Not found' };
  throw e;
}
```

`apps/web/scripts/admin-args.ts`:

```ts
import { parseArgs } from 'node:util';
import { isUuid, LINK_TARGETS, type LinkTarget, type Role, ROLES } from '@cs/core';

export type AdminCommand =
  | { cmd: 'agencies' }
  | { cmd: 'create-agency'; name: string }
  | { cmd: 'invite'; agency: string; email: string; role: Role; client?: string }
  | { cmd: 'link'; contact: string; target: LinkTarget; id: string; client?: string };

export const ADMIN_USAGE = `Usage: pnpm --filter @cs/web admin <command> [options]
  agencies                                    list agencies (id, name)
  create-agency --name <name>                 create an agency
  invite --agency <uuid> --email <address> --role <${ROLES.join('|')}> [--client <uuid>]
                                              create a 14-day invitation; the person signs in at APP_URL/sign-in
  link --contact <uuid> --target <${LINK_TARGETS.join('|')}> --id <uuid> [--client <uuid>]
                                              print a signed deep link for a contact (--client required for agency contacts)`;

export function parseAdminArgs(argv: string[]): AdminCommand | { error: string } {
  let values: Record<string, string | undefined>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv, allowPositionals: true, strict: true,
      options: { name: { type: 'string' }, agency: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' }, client: { type: 'string' }, contact: { type: 'string' }, target: { type: 'string' }, id: { type: 'string' } },
    }) as { values: Record<string, string | undefined>; positionals: string[] });
  } catch (e) {
    return { error: (e as Error).message };
  }
  const uuid = (k: string) => (values[k] && isUuid(values[k]!) ? values[k]! : null);
  if (values.client && !uuid('client')) return { error: '--client must be a uuid' };
  const client = values.client ? { client: values.client } : {};
  switch (positionals[0]) {
    case 'agencies':
      return { cmd: 'agencies' };
    case 'create-agency':
      return values.name?.trim() ? { cmd: 'create-agency', name: values.name.trim() } : { error: '--name is required' };
    case 'invite': {
      const agency = uuid('agency');
      if (!agency || !values.email || !(ROLES as readonly string[]).includes(values.role ?? '')) return { error: 'invite needs --agency <uuid> --email <address> --role <role>' };
      return { cmd: 'invite', agency, email: values.email, role: values.role as Role, ...client };
    }
    case 'link': {
      const contact = uuid('contact');
      const id = uuid('id');
      if (!contact || !id || !(LINK_TARGETS as readonly string[]).includes(values.target ?? '')) return { error: 'link needs --contact <uuid> --target <target> --id <uuid>' };
      return { cmd: 'link', contact, target: values.target as LinkTarget, id, ...client };
    }
    default:
      return { error: 'Unknown command' };
  }
}
```

`apps/web/scripts/admin.ts` (run with `tsx`; service-role connection):

```ts
import { fileURLToPath } from 'node:url';
import { signLink } from '@cs/core';
import { agency, contact, createDb } from '@cs/db';
import { createInvitation } from '@cs/tools';
import { asc, eq } from 'drizzle-orm';
import { ADMIN_USAGE, parseAdminArgs } from './admin-args';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // optional
}

const parsed = parseAdminArgs(process.argv.slice(2));
if ('error' in parsed) {
  console.error(`${parsed.error}\n\n${ADMIN_USAGE}`);
  process.exit(2);
}
const { db, close } = createDb(process.env.SERVICE_DATABASE_URL!);
try {
  if (parsed.cmd === 'agencies') {
    for (const a of await db.select({ id: agency.id, name: agency.name }).from(agency).orderBy(asc(agency.name))) console.log(`${a.id}  ${a.name}`);
  } else if (parsed.cmd === 'create-agency') {
    const [a] = await db.insert(agency).values({ name: parsed.name }).returning({ id: agency.id });
    console.log(a!.id);
  } else if (parsed.cmd === 'invite') {
    const r = await createInvitation(db, { agencyId: parsed.agency, email: parsed.email, role: parsed.role, clientId: parsed.client ?? null, invitedBy: 'cli' });
    console.log(`Invitation ${r.id} expires ${r.expiresAt.toISOString()}. Sign in at ${process.env.APP_URL}/sign-in with ${parsed.email}.`);
  } else {
    const [c] = await db.select().from(contact).where(eq(contact.id, parsed.contact));
    if (!c) throw new Error('contact not found');
    const clientId = c.clientId ?? parsed.client;
    if (!clientId) throw new Error('--client is required for an agency contact');
    console.log(`${process.env.APP_URL}/l/${signLink(process.env.LINK_SIGNING_SECRET!, { sub: c.id, agency: c.agencyId, client: clientId, t: parsed.target, id: parsed.id })}`);
  }
} finally {
  await close();
}
```

(The `.env` path: `scripts/` → `apps/web` → `apps` → repo root = three levels up; verify by running `pnpm --filter @cs/web admin agencies` — a wrong depth silently loads nothing, HANDOVER §6.)

- [ ] **Step 4: The screens**

Each page calls `requireContext()` and `notFound()`s for roles that may not use it (team: agency roles; branding/webhooks: `agency_admin`; client delivery: agency roles with `canAccessClient`). Every mutation is a server action that re-derives `ctx` with `requireContext()` (never trusting form fields for identity or agency), calls the Task 3/6 function, returns a `FormResult` via `toFormResult`, and `revalidatePath`s its page. Forms are small client components with `useActionState` that show `error` / `message`.

- **Team** (`/agency/team`), actions `inviteAction`, `revokeMembershipAction`, `revokeInvitationAction`: `listTeam` → members table (name, email, role label, client or "All clients" / the assigned client names, a "Remove" button behind a shadcn `Dialog` confirm); pending invitations table (email, role, client, expires, "Revoke"); invite form: email, role select (agency roles listed only for admins), client select (from `list_clients`) shown for client roles, "Assigned clients" checkboxes for account managers (none ticked = all clients). Success message: "Invitation created. Ask them to sign in at {APP_URL}/sign-in with this email." (5a sends no invitation email.)
- **Branding** (`/agency/branding`), built to `docs/brand/mockups/05-white-label-settings.html`, action `saveBrandingAction`: fields display name, logo URL (https), primary and secondary colour (`type="color"` kept in sync with a hex text input), email from-name, sign-off; a live preview panel (client component) applying `themeVars()` to a mini sidebar, button and chip as the inputs change; `brandingProblems` messages shown inline; the note "The amber accent is part of the product and can't be changed."
- **Slack & Teams** (`/agency/webhooks`), actions `addWebhookAction`, `toggleWebhookAction`: `listWebhooks` table (kind, host, kinds or "All agency notices", an active `Switch`); add form: kind (Slack/Teams), URL (a `type="password"` input so it isn't shoulder-surfed), optional kind checkboxes over `AGENCY_KINDS`.
- **Client delivery** (`/c/[clientId]/settings/delivery`), actions `saveDeliveryAction`, `addRecipientAction`, `deactivateRecipientAction`: profile via `get_client_profile`; a form with an alert-mode radio group (Direct — "alerts go to the client at once"; After AM check (default) — "you approve each alert first"; Digest only — "alerts wait for the 17:00 digest"), a "Send untouched briefs automatically on Monday 07:00" switch and the business time-zone select → `parseDeliveryForm` → `updateClientDeliverySettings`; a recipients table (`listClientRecipients`: email, name, role, "Has account" badge, active, "Deactivate" behind a confirm dialog that says "Links already sent to this person stop working.") and an add-recipient form (email, name, owner/viewer) → `addClientRecipient`.

- [ ] **Step 5: Run tests, typecheck, build** — `pnpm --filter @cs/web exec vitest run src/server/forms.test.ts scripts/admin-args.test.ts` → PASS; typecheck; build; `pnpm --filter @cs/web admin agencies` lists the `cs_dev` agencies.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): team, branding, webhook and client delivery settings, admin CLI"
```

---

### Task 19: E2E smoke tests, live verification and documentation

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/e2e/seed.ts`, `apps/web/e2e/smoke.spec.ts`
- Modify: `.github/workflows/ci.yml`, `docs/HANDOVER.md`, `docs/superpowers/plans/2026-09-29-roadmap.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `pnpm --filter @cs/web e2e` (not part of `pnpm test`).

- [ ] **Step 1: Playwright config and seed**

`apps/web/playwright.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // optional
}
const PORT = 3100;
export const OUTBOX = fileURLToPath(new URL('./test-results/outbox', import.meta.url));
export const OWNER_LINK_FILE = fileURLToPath(new URL('./test-results/owner-link.txt', import.meta.url));
export const E2E_LINK_SECRET = 'e2e-link-secret-'.repeat(3);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      APP_URL: `http://localhost:${PORT}`,
      APP_DATABASE_URL: process.env.TEST_APP_DATABASE_URL!,
      SERVICE_DATABASE_URL: process.env.TEST_SERVICE_DATABASE_URL!,
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      BETTER_AUTH_SECRET: 'e2e-auth-secret-'.repeat(3),
      LINK_SIGNING_SECRET: E2E_LINK_SECRET,
      EMAIL_FROM: 'e2e@example.com',
      EMAIL_OUTBOX_DIR: OUTBOX,
      POSTMARK_SERVER_TOKEN: '',
      GOOGLE_CLIENT_ID: '',
      DEFAULT_AGENCY_ID: '',
      EVIDENCE_FS_DIR: fileURLToPath(new URL('./test-results/evidence', import.meta.url)),
    },
  },
});
```

`process.loadEnvFile` never overrides variables that are already set, so these `webServer.env` values win inside the server process (`next.config.ts` loads `.env` too). Confirm the `TEST_*` URLs point at `cs_test`.

`apps/web/e2e/global-setup.ts`: `import setup from '../../../packages/db/test/global-setup';` → `await setup()` (re-migrates `cs_test`, refusing any database not ending `_test`), then `await seed()`.

`apps/web/e2e/seed.ts` — `createDb(process.env.TEST_DATABASE_URL!)`, then insert: agency "E2E Agency" with `branding: { primary: '#7A3EE8' }`; client "E2E HVAC" (`hvac_plumbing`); competitor "Smith HVAC" linked via `client_competitor`; a `sent` brief for the client (delivery date `2026-10-05`) with one active item headlined "Smith HVAC cut AC tune-ups to $59" and `upsellTag: 'ppc_audit'`; an invitation for `admin@e2e.test` as `agency_admin` (expires in 14 days); a client contact `owner@e2e.test` (`client_owner`, no user). Write `signLink(E2E_LINK_SECRET, { sub: ownerContactId, agency, client, t: 'brief', id: briefId })` as `http://localhost:3100/l/<token>` to `OWNER_LINK_FILE`, and empty `OUTBOX` (`rm -rf` + `mkdir`).

- [ ] **Step 2: Write the smoke tests**

`apps/web/e2e/smoke.spec.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { OUTBOX, OWNER_LINK_FILE } from '../playwright.config';

async function latestMagicLink(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const files = (await readdir(OUTBOX).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort();
    if (files.length) {
      const msg = JSON.parse(await readFile(join(OUTBOX, files.at(-1)!), 'utf8')) as { text: string };
      const m = /https?:\/\/\S+magic-link\/verify\S+/.exec(msg.text);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no magic link in the outbox');
}

test('an invited admin signs in by magic link and sees the themed client list', async ({ page }) => {
  await page.goto('/agency');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fagency/);
  await page.getByLabel(/email/i).fill('admin@e2e.test');
  await page.getByRole('button', { name: /email me a sign-in link/i }).click();
  await expect(page).toHaveURL(/check-email/);
  await page.goto(await latestMagicLink());
  await expect(page).toHaveURL(/\/agency$/);
  await expect(page.getByRole('link', { name: 'E2E HVAC' })).toBeVisible();
  const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
  expect(primary.toLowerCase()).toBe('#7a3ee8');
  await page.getByRole('link', { name: 'E2E HVAC' }).click();
  await page.getByRole('link', { name: /week of/i }).first().click();
  await expect(page.getByText('Upsell: ppc_audit')).toBeVisible();
});

test('a client opens a signed email link as a read-only guest without agency data', async ({ page }) => {
  await page.goto((await readFile(OWNER_LINK_FILE, 'utf8')).trim());
  await expect(page.getByRole('heading', { name: 'Smith HVAC cut AC tune-ups to $59' })).toBeVisible();
  await expect(page.getByText(/viewing this through an email link/i)).toBeVisible();
  await expect(page.getByText(/ppc_audit/)).toHaveCount(0);
  const res = await page.goto('/agency');
  expect(res?.status()).toBe(404);
});

test('sign-in never redirects off-site (Review Focus 2)', async ({ page }) => {
  await page.goto('/sign-in?next=//evil.example/x');
  await page.getByLabel(/email/i).fill('admin@e2e.test');
  await page.getByRole('button', { name: /email me a sign-in link/i }).click();
  await expect(page).toHaveURL(/check-email/);
  await page.goto(await latestMagicLink());
  expect(new URL(page.url()).host).toBe('localhost:3100');
});
```

`/agency` for a client-role guest hits `notFound()` (Task 13) → 404.

- [ ] **Step 3: Run the E2E suite**

Run once: `pnpm --filter @cs/web exec playwright install chromium`. Then `pnpm --filter @cs/web e2e` in the background (the production build takes minutes) and poll it with short foreground checks; start no other test run against `cs_test` meanwhile.
Expected: 3 passed.

- [ ] **Step 4: CI**

In `.github/workflows/ci.yml`, after `- run: pnpm test`, add:

```yaml
      - name: Install Playwright chromium for web E2E
        run: pnpm --filter @cs/web exec playwright install --with-deps chromium
      - name: Web E2E
        run: pnpm --filter @cs/web e2e
```

(CI already provides the three `TEST_*` URLs; the Playwright config supplies the rest.)

- [ ] **Step 5: Full suite**

Run `pnpm typecheck`, then the full `pnpm test` in the background (≈ 20+ minutes against Neon; use `pnpm turbo run test --concurrency=1 --continue` to see every package's result). Expected: all green — the previous baseline was 1029 passed + 3 skipped, plus this phase's new tests. Record the per-package counts.

- [ ] **Step 6: Live verification on `cs_dev` (controller, with the owner)**

1. `pnpm db:migrate` (`cs_dev` → `0035`).
2. Run the web app with the file outbox so the magic link is readable locally (the Postmark *test* server accepts but never delivers): in PowerShell `$env:POSTMARK_SERVER_TOKEN=''; pnpm dev:web`.
3. `pnpm --filter @cs/web admin invite --agency aaf5e009-974b-4ce8-b7ec-b722c5c66b1c --email <owner's email> --role agency_admin`.
4. Sign in at `http://localhost:3000/sign-in`; open the newest `apps/web/.outbox/*.html` and click its link. Check: themed shell; the client list shows "CS Dev Verification Client"; the client home lists the stored quiet brief (delivery 2026-10-12); the brief page renders; Team shows the owner; Branding saves a colour and the shell picks it up; Notifications toggles persist; Inbox lists any 4b in-app notifications for contacts linked to the owner.
5. Deep link: `pnpm --filter @cs/web admin link --contact <id of the owner@example.com contact> --target brief --id <brief id>`; open it in a private window → guest view of the brief (a `ready` brief 404s for a client — use a sent one or let the owner approve/send it first, step 6). Deactivate that recipient under Client delivery → reload → the guest session ends; open the link again → "This link has expired".
6. PDF: only with the owner's go-ahead, approve and send the brief with `pnpm --filter @cs/worker deliver-once send --brief <id>` (file outbox for the `@example.com` contacts), start the worker, open `/files/brief/<id>` → "Preparing…" then the PDF.
7. Record every finding in the HANDOVER; fix code bugs with a regression test before continuing.

- [ ] **Step 7: Documentation**

- `docs/HANDOVER.md`: state line (5a merged; next: write the 5b plan); a Phase 5a paragraph in §3 (what was built, migrations `0033`–`0035`, packages `@cs/tools` / `@cs/ui` / `@cs/web`, decisions 1–12 in one line each, test counts, live-verification results); §4 env additions (`BETTER_AUTH_SECRET`; optional `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `DEFAULT_AGENCY_ID`; `pnpm dev:web`; the `admin` CLI); §5 next steps (write the 5b plan from the overview table above); §6 gotchas — Better Auth tables live in schema `auth` with camelCase columns and are never auto-migrated (drift test `auth-schema.test.ts`; a Better Auth upgrade that changes them needs a new migration); `membership`/`invitation` are service-role only; Next 16 uses `proxy.ts`, async `params`/`cookies()`/`headers()`; the web app resolves a relative `EVIDENCE_FS_DIR` against `apps/worker`; guest cookies are 24 h, client contacts only, re-checked every request; `callTool` turns refusals into 404s; E2E is not part of `pnpm test`.
- Roadmap: Phase 5 row → "5a ✅ done <date> ([plan](2026-10-04-phase-5a-app-foundation-and-auth.md)) · 5b / 5c to be written" with the overview table's scope; a "Phase 5a carry-over" section with per-task review minors plus these known follow-ups: invitation emails (5a sends none); pg-boss enqueue from the web app with the owner role (Phase 7 least privilege); evaluate Better Auth's OAuth 2.1 provider for MCP in the Phase 6 plan; the 4b "Not in 4b" items still open (SMS, per-agency sending domains, Postmark bounce/complaint webhooks, per-user digest hour, translated emails).

- [ ] **Step 8: Commit**

```bash
git add apps/web .github/workflows/ci.yml docs
git commit -m "test(web): Playwright smoke E2E; docs: Phase 5a live verification and handover"
```

---

## Self-review notes (writing-plans checklist, done 2026-10-04)

- **Spec coverage (5a scope):** §3 roles/scopes → Tasks 1–3, 11; §5.1 branding, users → Tasks 6, 18 (usage/limits, approval queue, playbooks, prospecting → 5b); §5.2 module 11 notification preferences → Tasks 5, 17 (other modules → 5c); §8.1 registry + access context + audit → Task 4; §9.2 signed deep links, PDF → Tasks 15, 16; §9.3 per-user channel preferences and quiet hours, Slack/Teams webhooks → Tasks 5, 6, 17, 18; §10.2 Next.js/Tailwind/shadcn/Better Auth/per-agency CSS variables → Tasks 7, 9, 10, 13; §10.3 single-host agency default → Task 10 (`DEFAULT_AGENCY_ID`). 4b obligations: `/l` and `/go` (Task 15), on-demand PDF (Task 16), service-role tables via role-checked functions (Tasks 5, 6), client-facing status filters (Task 4), calling `addContact`/`setNotificationPref`/`addAgencyWebhook`/`updateClientDelivery` (Tasks 2, 5, 6) — `approveAlert`/`dismissAlert`/`sendBriefNow` (+ enqueue `brief-pdf`) are 5b's approval-queue screens.
- **Review Focus → tests:** 1 → `links.test.ts` "different signed-in user" + `/link-other-account`; 2 → `safe-next.test.ts` + E2E test 3; 3 → `links.test.ts` revoked/inactive, `viewer.test.ts` deactivated guest, `settings.test.ts` deactivate sets `links_revoked_before`; 4 → `team.test.ts` last-admin + revoke unlinks contact (context rebuilt per request, decision 3); 5 → `theme.test.ts` non-hex never emitted, `settings.test.ts` rejects bad colour/URL.
- **Type consistency:** `MembershipSummary`, `GuestSessionClaims`, `InboxOwner`, `ToolDeps`, `Viewer`, `Enqueue`, `LinkOutcome` are defined once and used with the same shapes across tasks.
