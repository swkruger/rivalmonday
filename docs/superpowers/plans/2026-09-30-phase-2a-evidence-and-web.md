# Phase 2a — Evidence Vault & Website Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture competitor web pages honestly and cheaply — discover the pages worth watching, render them politely, store hashed evidence (HTML, text, screenshot) in object storage, record every capture with a status, and run it all on a schedule in the worker.

**Architecture:** Two new packages: `@cs/storage` (object-store interface with memory, filesystem and Cloudflare R2 implementations) and `@cs/collectors` (robots/rate-limit politeness, Playwright renderer, evidence recorder, page discovery, due-page scheduling). New global tables `tracked_page`, `capture`, `evidence` hold public data once per competitor; `app_user` can only read them through a visible `client_competitor` link and can never write them. The worker gains three jobs (`web-schedule`, `web-capture-page`, `discover-pages`) and a `collect-once` CLI for manual end-to-end runs.

**Tech Stack:** Existing (Node 24, pnpm 10, TypeScript 5.9, Vitest 3, Zod 4, Drizzle 0.44, postgres.js, pg-boss 10, Neon Postgres) plus Playwright (chromium), sharp, robots-parser 3, fast-xml-parser 5, @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner 3.

**Spec:** [docs/superpowers/specs/2026-09-29-core-platform-design.md](../specs/2026-09-29-core-platform-design.md) §4.1–§4.4 · **Roadmap:** [2026-09-29-roadmap.md](2026-09-29-roadmap.md) · **Vendor/API reference:** [docs/research/2026-09-30-phase-2-vendor-apis.md](../../research/2026-09-30-phase-2-vendor-apis.md)

## Global Constraints

- Everything from the Phase 1 plan's Global Constraints still applies (Node ≥22 — we run 24, pnpm 10, strict TS, ESM, `@cs/*` packages exporting `./src/index.ts`, zod 4 / drizzle-orm 0.44 / drizzle-kit 0.31 / pg-boss 10 / vitest 3 majors, tenant isolation below the model, fail-closed tenant context, serverless-safe shared packages, commit trailer).
- **Crawler conduct (spec §4.2, non-negotiable):** User-Agent `Mozilla/5.0 (compatible; RivalMondayBot/1.0; +https://rivalmonday.com/bot)`; robots token `RivalMondayBot`; honour robots.txt per RFC 9309 (2xx → obey rules; 4xx → allow all; 5xx/unreachable → disallow all); ≥ 3 s between requests to the same host (or robots `Crawl-delay` if larger, capped at 60 s); no logins, no proxies, no anti-bot evasion; a challenge or 401/403/429 response is recorded as `blocked` and never retried with different tactics.
- **Evidence is immutable:** evidence rows and objects are never updated or overwritten; an unchanged page creates a capture with status `unchanged` and no new objects.
- Global public-data tables (`competitor`, `tracked_page`, `capture`, `evidence`) are written only by the service role (`app_service`); `app_user` has SELECT only, filtered by RLS through visible `client_competitor` links.
- Existing migrations `0000`–`0006` are applied to Neon `cs_dev` and must never be edited; add new migrations only.
- Tests touching the database use the Neon `cs_test` database through the repo-root `.env` (never print or commit it). Tests needing a real browser use the locally installed Playwright chromium.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **robots.txt unreachable or 5xx** — the crawler must treat the whole site as disallowed (not crawl); a 404 robots.txt means allow all. Pinned in Task 4.
2. **A site that answers with a bot challenge or 403** — capture status `blocked`, no screenshot, no evidence objects, and no retry with other tactics. Pinned in Tasks 5 and 6.
3. **A page whose visible text did not change** — status `unchanged`, no new objects written and no screenshot taken (cost and storage). Pinned in Task 6.
4. **Two scheduler runs overlapping** (two worker replicas, or a slow run) — each due page is claimed exactly once. Pinned in Task 8.
5. **A client-scoped user reading evidence** — sees only captures of competitors their own client tracks; never another agency's or client's competitors. Pinned in Task 3.

---

## File map

```
packages/core/src/domain.ts            + PAGE_TYPES, CAPTURE_STATUSES, CADENCES
packages/ai/
  vitest.config.ts                     (new) loads repo-root .env so the Jev live test runs
  src/decisions/{types,jev}.ts         Jev score contract fix
packages/storage/                      (new) @cs/storage
  src/{keys,store,memory,fs,r2,env,index}.ts + tests
packages/db/
  src/schema/evidence.ts               (new) tracked_page, capture, evidence
  migrations/0007_evidence.sql         (generated) + 0008_evidence_rls.sql (custom)
  src/evidence.test.ts                 (new) RLS + privilege guard tests
packages/collectors/                   (new) @cs/collectors
  src/web/{user-agent,robots,rate-limit,blocked,renderer,polite}.ts
  src/evidence/recorder.ts
  src/discovery/{urls,sitemap,classify,select,discover}.ts
  src/schedule/due-pages.ts
  src/capture/capture-page.ts
  test/fixtures-server.ts
apps/worker/
  src/deps.ts                          (new) lazy worker dependencies
  src/jobs/web.ts                      (new) web-schedule, web-capture-page, discover-pages
  src/cli/collect-once.ts              (new) manual end-to-end run
.github/workflows/ci.yml               + Playwright chromium install
.env.example, README.md                + storage / worker env vars
```

---

### Task 1: Jev score contract fix and `@cs/ai` env loading

The live contract test (run 2026-09-30 against `jev-1.13.0`) showed Jev's `score` is a probability-weighted **average** (e.g. `1.2`), while the level indices live in `probabilities` / `legend` keys (`"0"`, `"1"`, …, 0-based). The Phase 1 adapter treated `score` as the level and correctly rejected the call. This task maps the most likely level instead and keeps the average as `expected`.

**Files:**
- Modify: `packages/ai/src/decisions/types.ts`, `packages/ai/src/decisions/jev.ts`, `packages/ai/src/decisions/jev.test.ts`, `packages/ai/src/decisions/jev.live.test.ts`
- Create: `packages/ai/vitest.config.ts`

**Interfaces:**
- Produces: score answers `{ type: 'score'; value: number /* 0-based level with highest probability */; expected?: number /* Jev weighted average */; probabilities; confidence }`; exported helper `mostLikelyLevel(probabilities: Record<string, number>, levelCount: number): number | null`.

- [ ] **Step 1: Update the tests first**

In `packages/ai/src/decisions/jev.test.ts`:
1. In the shared `jevResponse` fixture change the `severity` answer to a realistic Jev payload:
```ts
    severity: { type: 'score', score: 1.4, legend: { '0': 'minor', '1': 'moderate', '2': 'major' }, probabilities: { '0': 0.1, '1': 0.4, '2': 0.5 }, confidence: 0.5 },
```
2. Replace the existing normalisation assertion for `severity` with:
```ts
    expect(r.answers.severity).toMatchObject({ type: 'score', value: 2, expected: 1.4, confidence: 0.5 });
```
3. Replace the existing "score out of range" test body with:
```ts
  it('throws when score probabilities name a level outside the question', async () => {
    const bad = { ...jevResponse, answers: { ...jevResponse.answers, severity: { ...jevResponse.answers.severity, probabilities: { '0': 0.2, '3': 0.8 } } } };
    await expect(setup(bad).provider.decide('s', questions)).rejects.toMatchObject({ provider: 'jev', retryable: false });
    await expect(setup(bad).provider.decide('s', questions)).rejects.toThrow(/severity/);
  });

  it('throws when score probabilities are empty', async () => {
    const bad = { ...jevResponse, answers: { ...jevResponse.answers, severity: { ...jevResponse.answers.severity, probabilities: {} } } };
    await expect(setup(bad).provider.decide('s', questions)).rejects.toThrow(/severity/);
  });
```
4. Add at the bottom of the file:
```ts
import { mostLikelyLevel } from './jev';

describe('mostLikelyLevel', () => {
  it('picks the highest-probability level and breaks ties toward the lower level', () => {
    expect(mostLikelyLevel({ '0': 0, '1': 0.8, '2': 0.2 }, 3)).toBe(1);
    expect(mostLikelyLevel({ '0': 0.5, '1': 0.5 }, 2)).toBe(0);
  });
  it('rejects non-integer, negative or out-of-range keys', () => {
    expect(mostLikelyLevel({ a: 1 }, 3)).toBeNull();
    expect(mostLikelyLevel({ '-1': 1 }, 3)).toBeNull();
    expect(mostLikelyLevel({ '3': 1 }, 3)).toBeNull();
    expect(mostLikelyLevel({}, 3)).toBeNull();
  });
});
```
(Move the new `import` to the top of the file with the other imports.)

In `packages/ai/src/decisions/jev.live.test.ts` replace the test name and the last two `size` assertions with:
```ts
  it('answers all three primitives; score maps to an integer 0-based level', async () => {
```
```ts
    expect(Number.isInteger(r.answers.size.value)).toBe(true);
    expect(r.answers.size.value).toBeGreaterThanOrEqual(0);
    expect(r.answers.size.value).toBeLessThanOrEqual(2);
    expect(r.answers.size.type === 'score' && typeof r.answers.size.expected).toBe('number');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/ai exec vitest run src/decisions/jev.test.ts`
Expected: FAIL — `mostLikelyLevel` is not exported; severity value/expected mismatch.

- [ ] **Step 3: Implement**

`packages/ai/src/decisions/types.ts` — change the score member of `DecisionAnswer` to:
```ts
  | { type: 'score'; value: number; expected?: number; probabilities: Record<string, number>; confidence: number }
```

`packages/ai/src/decisions/jev.ts`:
1. In `answerSchema` change the score object to:
```ts
  z.object({
    type: z.literal('score'),
    score: z.number(),
    legend: z.record(z.string(), z.string()).optional(),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number().min(0).max(1),
  }),
```
2. Add above `createJevProvider`:
```ts
/**
 * Jev returns `score` as a probability-weighted average (e.g. 1.2); the discrete level is the
 * 0-based key of `probabilities` with the highest probability. Returns null if any key is not a
 * valid level index for this question, or if there are no keys.
 */
export function mostLikelyLevel(probabilities: Record<string, number>, levelCount: number): number | null {
  let best: number | null = null;
  let bestP = -1;
  for (const [key, p] of Object.entries(probabilities)) {
    if (!/^\d+$/.test(key)) return null;
    const level = Number(key);
    if (level >= levelCount) return null;
    if (p > bestP || (p === bestP && best !== null && level < best)) {
      best = level;
      bestP = p;
    }
  }
  return best;
}
```
3. Replace the score branch inside `decide` with:
```ts
        } else if (a.type === 'score' && q.type === 'score') {
          const level = mostLikelyLevel(a.probabilities, q.levels.length);
          if (level === null) {
            throw new AiProviderError('jev', 200, `Answer for ${key} is out of range`, false);
          }
          answers[key as K] = { type: 'score', value: level, expected: a.score, probabilities: a.probabilities, confidence: a.confidence };
        }
```

`packages/ai/vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // repo-root .env is optional (e.g. CI); the Jev live test skips without TYPESAFE_API_KEY
}

export default defineConfig({ test: {} });
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @cs/ai test && pnpm --filter @cs/ai typecheck`
Expected: PASS, and `jev.live.test.ts` now RUNS (not skipped) because `.env` has `TYPESAFE_API_KEY`, and passes.

- [ ] **Step 5: Commit**

```bash
git add packages/ai
git commit -m "fix(ai): map Jev score answers to the most likely 0-based level

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `@cs/storage` — object store with memory, filesystem and R2 backends

**Files:**
- Create: `packages/storage/package.json`, `packages/storage/tsconfig.json`, `packages/storage/vitest.config.ts`
- Create: `packages/storage/src/keys.ts`, `store.ts`, `memory.ts`, `fs.ts`, `r2.ts`, `env.ts`, `index.ts`
- Test: `packages/storage/src/contract.ts` (shared contract), `memory.test.ts`, `fs.test.ts`, `r2.live.test.ts`, `keys.test.ts`

**Interfaces:**
- Produces:
  - `interface ObjectStore { readonly kind: 'memory' | 'fs' | 'r2'; put(key: string, body: Uint8Array, contentType: string): Promise<void>; get(key: string): Promise<Uint8Array | null>; exists(key: string): Promise<boolean>; signedUrl(key: string, expiresInSeconds: number): Promise<string> }`
  - `assertValidKey(key: string): void`
  - `createMemoryStore(): ObjectStore`, `createFsStore(rootDir: string): ObjectStore`, `createR2Store(cfg: R2Config): ObjectStore` with `R2Config { accountId; accessKeyId; secretAccessKey; bucket }`
  - `createStoreFromEnv(env: NodeJS.ProcessEnv): ObjectStore` — R2 when all of `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` are set; else filesystem when `EVIDENCE_FS_DIR` is set; else throws.

- [ ] **Step 1: Create package files**

`packages/storage/package.json`:
```json
{
  "name": "@cs/storage",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p .",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.890.0",
    "@aws-sdk/s3-request-presigner": "^3.890.0"
  },
  "devDependencies": {
    "@types/node": "^22.18.0",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```
`packages/storage/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src", "vitest.config.ts"] }`

`packages/storage/vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // optional
}

export default defineConfig({ test: { testTimeout: 20_000 } });
```
Run `pnpm install`. If `@aws-sdk` resolves a lower 3.x than `^3.890.0` allows, set the range to the installed 3.x minor.

- [ ] **Step 2: Write the failing tests**

`packages/storage/src/contract.ts` (shared, not a test file itself):
```ts
import { describe, expect, it } from 'vitest';
import type { ObjectStore } from './store';

export function runStoreContract(name: string, make: () => Promise<ObjectStore> | ObjectStore): void {
  describe(`${name} store contract`, () => {
    it('round-trips bytes and reports existence', async () => {
      const store = await make();
      const key = `contract/${crypto.randomUUID()}/a.txt`;
      expect(await store.exists(key)).toBe(false);
      expect(await store.get(key)).toBeNull();
      await store.put(key, new TextEncoder().encode('hello'), 'text/plain');
      expect(await store.exists(key)).toBe(true);
      expect(new TextDecoder().decode((await store.get(key)) ?? new Uint8Array())).toBe('hello');
    });

    it('returns a non-empty signed URL', async () => {
      const store = await make();
      const key = `contract/${crypto.randomUUID()}/b.bin`;
      await store.put(key, new Uint8Array([1, 2, 3]), 'application/octet-stream');
      expect(await store.signedUrl(key, 60)).toMatch(/\S+/);
    });

    it('rejects invalid keys', async () => {
      const store = await make();
      await expect(store.put('../escape.txt', new Uint8Array(), 'text/plain')).rejects.toThrow(/invalid object key/i);
    });
  });
}
```

`packages/storage/src/keys.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { assertValidKey } from './keys';

describe('assertValidKey', () => {
  it('accepts normal evidence keys', () => {
    expect(() => assertValidKey('evidence/0000-aa/1111-bb/page.html.gz')).not.toThrow();
  });
  it.each(['', '/abs', '../up', 'a/../b', 'a//b', 'a\\b', 'with space', `x${'a'.repeat(600)}`])('rejects %j', (k) => {
    expect(() => assertValidKey(k)).toThrow(/invalid object key/i);
  });
});
```

`packages/storage/src/memory.test.ts`:
```ts
import { runStoreContract } from './contract';
import { createMemoryStore } from './memory';

runStoreContract('memory', () => createMemoryStore());
```

`packages/storage/src/fs.test.ts`:
```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';
import { runStoreContract } from './contract';
import { createFsStore } from './fs';

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

runStoreContract('fs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cs-store-'));
  dirs.push(dir);
  return createFsStore(dir);
});
```

`packages/storage/src/r2.live.test.ts`:
```ts
import { describe } from 'vitest';
import { runStoreContract } from './contract';
import { createR2Store } from './r2';

const e = process.env;
const configured = Boolean(e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET);

// Runs only when R2 credentials are present in the environment / repo-root .env.
describe.skipIf(!configured)('r2 live', () => {
  runStoreContract('r2', () =>
    createR2Store({
      accountId: e.R2_ACCOUNT_ID as string,
      accessKeyId: e.R2_ACCESS_KEY_ID as string,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY as string,
      bucket: e.R2_BUCKET as string,
    }),
  );
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @cs/storage test`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`packages/storage/src/keys.ts`:
```ts
const KEY = /^[A-Za-z0-9][A-Za-z0-9._\-]*(\/[A-Za-z0-9][A-Za-z0-9._\-]*)*$/;

/** Object keys are generated by us from UUIDs and fixed names; anything else is a bug or an attack. */
export function assertValidKey(key: string): void {
  if (key.length === 0 || key.length > 512 || !KEY.test(key) || key.split('/').some((seg) => seg === '..' || seg === '.')) {
    throw new Error(`Invalid object key: ${JSON.stringify(key.slice(0, 80))}`);
  }
}
```

`packages/storage/src/store.ts`:
```ts
export interface ObjectStore {
  readonly kind: 'memory' | 'fs' | 'r2';
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  exists(key: string): Promise<boolean>;
  /** Time-limited URL for reading the object (R2 presigned URL; file:// or memory:// in dev/test). */
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
```

`packages/storage/src/memory.ts`:
```ts
import { assertValidKey } from './keys';
import type { ObjectStore } from './store';

export function createMemoryStore(): ObjectStore {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    kind: 'memory',
    async put(key, body, contentType) {
      assertValidKey(key);
      objects.set(key, { body: new Uint8Array(body), contentType });
    },
    async get(key) {
      assertValidKey(key);
      const o = objects.get(key);
      return o ? new Uint8Array(o.body) : null;
    },
    async exists(key) {
      assertValidKey(key);
      return objects.has(key);
    },
    async signedUrl(key, expiresInSeconds) {
      assertValidKey(key);
      return `memory://${key}?expires=${expiresInSeconds}`;
    },
  };
}
```

`packages/storage/src/fs.ts`:
```ts
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertValidKey } from './keys';
import type { ObjectStore } from './store';

/** Local-disk store for development. Not for production (no signed URLs, no replication). */
export function createFsStore(rootDir: string): ObjectStore {
  const root = resolve(rootDir);
  const pathFor = (key: string) => {
    assertValidKey(key);
    return join(root, ...key.split('/'));
  };
  return {
    kind: 'fs',
    async put(key, body) {
      const p = pathFor(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async exists(key) {
      try {
        await stat(pathFor(key));
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw err;
      }
    },
    async signedUrl(key) {
      return pathToFileURL(pathFor(key)).href;
    },
  };
}
```

`packages/storage/src/r2.ts` (check the "Cloudflare R2" section of the vendor reference doc; if it documents different client options, follow it and note it in the report):
```ts
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertValidKey } from './keys';
import type { ObjectStore } from './store';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
}

export function createR2Store(cfg: R2Config, client?: S3Client): ObjectStore {
  const s3 =
    client ??
    new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // Newer AWS SDKs add CRC checksums by default; R2 only needs them when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  return {
    kind: 'r2',
    async put(key, body, contentType) {
      assertValidKey(key);
      await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      assertValidKey(key);
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async exists(key) {
      assertValidKey(key);
      try {
        await s3.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return true;
      } catch (err) {
        if (isNotFound(err)) return false;
        throw err;
      }
    },
    async signedUrl(key, expiresInSeconds) {
      assertValidKey(key);
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: expiresInSeconds });
    },
  };
}
```

`packages/storage/src/env.ts`:
```ts
import { createFsStore } from './fs';
import { createR2Store } from './r2';
import type { ObjectStore } from './store';

export function createStoreFromEnv(env: NodeJS.ProcessEnv): ObjectStore {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, EVIDENCE_FS_DIR } = env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
    return createR2Store({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
  }
  if (EVIDENCE_FS_DIR) return createFsStore(EVIDENCE_FS_DIR);
  throw new Error('No evidence store configured: set R2_* variables or EVIDENCE_FS_DIR');
}
```

`packages/storage/src/index.ts`:
```ts
export * from './env';
export * from './fs';
export * from './keys';
export * from './memory';
export * from './r2';
export * from './store';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @cs/storage test && pnpm --filter @cs/storage typecheck`
Expected: PASS (memory + fs contract, keys); `r2 live` skipped unless R2 variables are set.

- [ ] **Step 6: Commit**

```bash
git add packages/storage pnpm-lock.yaml
git commit -m "feat(storage): object store with memory, filesystem and R2 backends

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Evidence schema, RLS and privilege guard

**Files:**
- Modify: `packages/core/src/domain.ts`, `packages/core/src/domain.test.ts`
- Create: `packages/db/src/schema/evidence.ts`; Modify: `packages/db/src/schema/index.ts`
- Generated: `packages/db/migrations/0007_evidence.sql`; generated then edited: `0008_evidence_rls.sql`
- Test: `packages/db/src/evidence.test.ts`

**Interfaces:**
- Produces (core): `PAGE_TYPES = ['home','pricing','service','service_area','promo','careers','team','about','contact','blog','other'] as const`, `PageType`; `CAPTURE_STATUSES = ['ok','unchanged','blocked','robots_disallowed','vendor_error','timeout','error'] as const`, `CaptureStatus`; `CADENCES = ['daily','weekly'] as const`, `Cadence`.
- Produces (db): tables `trackedPage`, `capture`, `evidence`; SQL function `app_competitor_visible(uuid)`.

- [ ] **Step 1: Core constants — test first**

Append to `packages/core/src/domain.test.ts`:
```ts
import { CADENCES, CAPTURE_STATUSES, PAGE_TYPES } from './domain';

describe('collection constants', () => {
  it('lists page types, capture statuses and cadences', () => {
    expect(PAGE_TYPES).toEqual(['home', 'pricing', 'service', 'service_area', 'promo', 'careers', 'team', 'about', 'contact', 'blog', 'other']);
    expect(CAPTURE_STATUSES).toEqual(['ok', 'unchanged', 'blocked', 'robots_disallowed', 'vendor_error', 'timeout', 'error']);
    expect(CADENCES).toEqual(['daily', 'weekly']);
  });
});
```
(merge the import into the existing import line.) Run `pnpm --filter @cs/core test` → FAIL. Then append to `packages/core/src/domain.ts`:
```ts
export const PAGE_TYPES = ['home', 'pricing', 'service', 'service_area', 'promo', 'careers', 'team', 'about', 'contact', 'blog', 'other'] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const CAPTURE_STATUSES = ['ok', 'unchanged', 'blocked', 'robots_disallowed', 'vendor_error', 'timeout', 'error'] as const;
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export const CADENCES = ['daily', 'weekly'] as const;
export type Cadence = (typeof CADENCES)[number];
```
Run `pnpm --filter @cs/core test` → PASS.

- [ ] **Step 2: Write the failing DB tests**

`packages/db/src/evidence.test.ts`:
```ts
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { errorText, IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { capture, evidence, trackedPage } from './schema';
import { withTenant } from './tenant';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const PAGE_X = '00000000-0000-4000-8000-0000000000e1';
const PAGE_Y = '00000000-0000-4000-8000-0000000000e2';
const CAP_X = '00000000-0000-4000-8000-0000000000c1';
const CAP_Y = '00000000-0000-4000-8000-0000000000c2';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values([
    { id: PAGE_X, competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing', pageType: 'pricing', source: 'sitemap', cadence: 'daily' },
    { id: PAGE_Y, competitorId: IDS.competitorY, url: 'https://brightsmiles.example/', pageType: 'home', source: 'nav', cadence: 'daily' },
  ]);
  await dbs.service.insert(capture).values([
    { id: CAP_X, competitorId: IDS.competitorX, trackedPageId: PAGE_X, source: 'web', url: 'https://smithhvac.example/pricing', status: 'ok', httpStatus: 200, collectorVersion: 'web/1' },
    { id: CAP_Y, competitorId: IDS.competitorY, trackedPageId: PAGE_Y, source: 'web', url: 'https://brightsmiles.example/', status: 'ok', httpStatus: 200, collectorVersion: 'web/1' },
  ]);
  await dbs.service.insert(evidence).values([
    { captureId: CAP_X, kind: 'text', objectKey: `evidence/${IDS.competitorX}/${CAP_X}/text.txt`, sha256: 'a'.repeat(64), bytes: 10, contentType: 'text/plain' },
    { captureId: CAP_Y, kind: 'text', objectKey: `evidence/${IDS.competitorY}/${CAP_Y}/text.txt`, sha256: 'b'.repeat(64), bytes: 10, contentType: 'text/plain' },
  ]);
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('evidence visibility', () => {
  it('shows nothing without tenant context', async () => {
    expect(await dbs.app.select().from(trackedPage)).toEqual([]);
    expect(await dbs.app.select().from(capture)).toEqual([]);
    expect(await dbs.app.select().from(evidence)).toEqual([]);
  });

  it('scopes pages, captures and evidence to competitors the client tracks', async () => {
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: [IDS.clientA1] }, async (tx) => {
      expect(ids(await tx.select().from(trackedPage))).toEqual([PAGE_X]);
      expect(ids(await tx.select().from(capture))).toEqual([CAP_X]);
      expect((await tx.select().from(evidence)).map((e) => e.captureId)).toEqual([CAP_X]);
    });
    await withTenant(dbs.app, { agencyId: IDS.agencyB, clientScope: 'all' }, async (tx) => {
      expect(ids(await tx.select().from(capture))).toEqual([CAP_X]);
    });
    await withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, async (tx) => {
      expect(ids(await tx.select().from(capture))).toEqual([CAP_X, CAP_Y].sort());
    });
  });

  it('never lets app_user write evidence tables or competitor', async () => {
    const text = await errorText(
      withTenant(dbs.app, { agencyId: IDS.agencyA, clientScope: 'all' }, (tx) =>
        tx.insert(capture).values({ competitorId: IDS.competitorX, source: 'web', status: 'ok', collectorVersion: 'x' }),
      ),
    );
    expect(text).toMatch(/permission denied/i);
  });
});

describe('privilege guard', () => {
  it('app_user has no INSERT/UPDATE/DELETE on system and global tables', async () => {
    const tables = ['agency', 'competitor', 'audit_log', 'llm_call', 'vendor_call', 'tracked_page', 'capture', 'evidence'];
    // Build a SQL array literal: drizzle expands a bare JS array into a parameter *list*, not an array.
    const tableArray = sql`ARRAY[${sql.join(tables.map((t) => sql`${t}`), sql`, `)}]::text[]`;
    const rows = (await dbs.owner.execute(sql`
      SELECT t AS table, p AS priv
      FROM unnest(${tableArray}) AS t, unnest(ARRAY['INSERT','UPDATE','DELETE']) AS p
      WHERE has_table_privilege('app_user', 'public.' || t, p)`)) as unknown as { table: string; priv: string }[];
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @cs/db test`
Expected: FAIL — `trackedPage`/`capture`/`evidence` not exported.

- [ ] **Step 4: Schema**

`packages/db/src/schema/evidence.ts`:
```ts
import { boolean, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { competitor } from './tenancy';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** A competitor page we monitor. Global public data, shared by every client tracking the competitor. */
export const trackedPage = pgTable(
  'tracked_page',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    pageType: text('page_type').notNull(),
    source: text('source').notNull(), // 'sitemap' | 'nav' | 'manual'
    pinned: boolean('pinned').notNull().default(false),
    active: boolean('active').notNull().default(true),
    cadence: text('cadence').notNull(), // 'daily' | 'weekly'
    nextDueAt: timestamp('next_due_at', { withTimezone: true }).notNull().defaultNow(),
    lastCapturedAt: timestamp('last_captured_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('tracked_page_competitor_url_unique').on(t.competitorId, t.url),
    index('tracked_page_due_idx').on(t.active, t.nextDueAt),
  ],
);

/** One collection attempt (web page, vendor call). Immutable. */
export const capture = pgTable(
  'capture',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    trackedPageId: uuid('tracked_page_id').references(() => trackedPage.id, { onDelete: 'set null' }),
    source: text('source').notNull(), // 'web' | vendor source ids in Phase 2b
    url: text('url'),
    status: text('status').notNull(), // CaptureStatus
    httpStatus: integer('http_status'),
    error: text('error'),
    collectorVersion: text('collector_version').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('capture_competitor_time_idx').on(t.competitorId, t.capturedAt),
    index('capture_page_time_idx').on(t.trackedPageId, t.capturedAt),
  ],
);

/** A stored artefact of a capture (html, text, screenshot, vendor json). Immutable. */
export const evidence = pgTable(
  'evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    captureId: uuid('capture_id').notNull().references(() => capture.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'html' | 'text' | 'screenshot' | 'vendor_json'
    objectKey: text('object_key').notNull(),
    sha256: text('sha256').notNull(),
    bytes: integer('bytes').notNull(),
    contentType: text('content_type').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('evidence_capture_kind_unique').on(t.captureId, t.kind), index('evidence_sha_idx').on(t.sha256)],
);
```
`packages/db/src/schema/index.ts`:
```ts
export * from './evidence';
export * from './ledger';
export * from './tenancy';
```
Run: `pnpm --filter @cs/db generate --name=evidence` → `0007_evidence.sql`. If drizzle-kit orders a FK before the table it references, reorder the statements by hand (tables first, then constraints) and mention it in the report.

- [ ] **Step 5: RLS migration**

Run: `pnpm --filter @cs/db generate --custom --name=evidence_rls` and fill `0008_evidence_rls.sql`:
```sql
CREATE OR REPLACE FUNCTION app_competitor_visible(cid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  -- Runs as the caller, so client_competitor RLS limits this to links the tenant context can see.
  SELECT EXISTS (SELECT 1 FROM client_competitor cc WHERE cc.competitor_id = cid)
$$;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON competitor, tracked_page, capture, evidence FROM app_user;
--> statement-breakpoint
ALTER TABLE tracked_page ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tracked_page FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tracked_page_visible ON tracked_page FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE capture ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE capture FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY capture_visible ON capture FOR SELECT USING (app_competitor_visible(competitor_id));
--> statement-breakpoint
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY evidence_visible ON evidence FOR SELECT
  USING (EXISTS (SELECT 1 FROM capture c WHERE c.id = evidence.capture_id));
```

- [ ] **Step 6: Update the existing competitor-write test, run tests, migrate dev, commit**

Revoking INSERT on `competitor` changes the error app_user gets from an RLS violation to `permission denied`. In `packages/db/src/tenant.test.ts`, find the test asserting that app_user INSERT into `competitor` is rejected (it matches `/row-level security/i`) and change its assertion to `expect(text).toMatch(/permission denied/i);` — the write is now stopped one layer earlier, by privileges.

Run: `pnpm --filter @cs/db test && pnpm --filter @cs/db typecheck` → PASS (existing RLS guard test also covers the new tables).
Run: `pnpm --filter @cs/db migrate` → "Migrations applied" (cs_dev; never print connection strings).
```bash
git add packages/core packages/db
git commit -m "feat(db): evidence schema (tracked_page, capture, evidence) with read-only RLS

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `@cs/collectors` package — user agent, robots policy, per-host rate limiter

**Files:**
- Create: `packages/collectors/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/collectors/src/web/user-agent.ts`, `robots.ts`, `rate-limit.ts`, `packages/collectors/src/index.ts`
- Test: `packages/collectors/src/web/robots.test.ts`, `rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `BOT_TOKEN = 'RivalMondayBot'`, `BOT_USER_AGENT = 'Mozilla/5.0 (compatible; RivalMondayBot/1.0; +https://rivalmonday.com/bot)'`
  - `type FetchText = (url: string) => Promise<{ status: number; body: string }>`; `defaultFetchText: FetchText` (UA header, 10 s timeout, body capped at 512 KB, network error → throws)
  - `interface RobotsVerdict { allowed: boolean; reason: 'allowed' | 'disallowed' | 'robots_unavailable'; crawlDelaySeconds: number | null; sitemaps: string[] }`
  - `class RobotsPolicy { constructor(fetchText: FetchText, now?: () => number, ttlMs?: number); check(url: string): Promise<RobotsVerdict> }`
  - `class HostRateLimiter { constructor(opts?: { minIntervalMs?: number; maxCrawlDelayMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> }); wait(url: string, crawlDelaySeconds?: number | null): Promise<void> }`

- [ ] **Step 1: Package files**

`packages/collectors/package.json`:
```json
{
  "name": "@cs/collectors",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p .",
    "test": "vitest run",
    "browsers": "playwright install chromium"
  },
  "dependencies": {
    "@cs/ai": "workspace:*",
    "@cs/core": "workspace:*",
    "@cs/db": "workspace:*",
    "@cs/storage": "workspace:*",
    "drizzle-orm": "^0.44.5",
    "fast-xml-parser": "^5.2.5",
    "playwright": "^1.55.0",
    "robots-parser": "^3.0.1",
    "sharp": "^0.34.3",
    "zod": "^4.1.5"
  },
  "devDependencies": {
    "@types/node": "^22.18.0",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
  }
}
```
`packages/collectors/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src", "test", "vitest.config.ts"] }`

`packages/collectors/vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // optional (CI injects env vars)
}

export default defineConfig({
  test: {
    // Reuse @cs/db's reset+migrate of the cs_test database; packages run sequentially (turbo --concurrency=1).
    globalSetup: ['../db/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
```
Run `pnpm install`, then `pnpm --filter @cs/collectors browsers` (downloads chromium once). Use the installed versions if they differ from the ranges above (same majors).

- [ ] **Step 2: Write the failing tests**

`packages/collectors/src/web/robots.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { RobotsPolicy } from './robots';
import { BOT_TOKEN } from './user-agent';

const robots = `User-agent: *
Disallow: /private
Crawl-delay: 5
Sitemap: https://site.example/sitemap.xml

User-agent: ${BOT_TOKEN}
Disallow: /no-bots
`;

function policy(response: { status: number; body: string } | Error) {
  const fetchText = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  let t = 0;
  return { p: new RobotsPolicy(fetchText, () => t, 1000), fetchText, advance: (ms: number) => { t += ms; } };
}

describe('RobotsPolicy', () => {
  it('obeys rules for our token and exposes sitemaps', async () => {
    const { p } = policy({ status: 200, body: robots });
    expect(await p.check('https://site.example/pricing')).toMatchObject({ allowed: true, reason: 'allowed', sitemaps: ['https://site.example/sitemap.xml'] });
    expect(await p.check('https://site.example/no-bots/x')).toMatchObject({ allowed: false, reason: 'disallowed' });
  });

  it('treats 4xx robots.txt as allow-all', async () => {
    const { p } = policy({ status: 404, body: 'nope' });
    expect(await p.check('https://site.example/anything')).toMatchObject({ allowed: true, reason: 'allowed', sitemaps: [] });
  });

  it('treats 5xx or unreachable robots.txt as disallow-all', async () => {
    expect(await policy({ status: 503, body: '' }).p.check('https://site.example/')).toMatchObject({ allowed: false, reason: 'robots_unavailable' });
    expect(await policy(new Error('ECONNRESET')).p.check('https://site.example/')).toMatchObject({ allowed: false, reason: 'robots_unavailable' });
  });

  it('caches per origin until the TTL expires', async () => {
    const { p, fetchText, advance } = policy({ status: 200, body: robots });
    await p.check('https://site.example/a');
    await p.check('https://site.example/b');
    expect(fetchText).toHaveBeenCalledTimes(1);
    advance(1001);
    await p.check('https://site.example/c');
    expect(fetchText).toHaveBeenCalledTimes(2);
    expect(fetchText).toHaveBeenCalledWith('https://site.example/robots.txt');
  });
});
```
Note: the group for `RivalMondayBot` does not repeat `Crawl-delay`, so its delay is `null` for our token; the test does not assert it.

`packages/collectors/src/web/rate-limit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { HostRateLimiter } from './rate-limit';

function limiter(minIntervalMs = 3000) {
  let t = 0;
  const sleeps: number[] = [];
  const l = new HostRateLimiter({
    minIntervalMs,
    maxCrawlDelayMs: 60_000,
    now: () => t,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
  });
  return { l, sleeps, advance: (ms: number) => { t += ms; } };
}

describe('HostRateLimiter', () => {
  it('spaces requests to the same host by the minimum interval', async () => {
    const { l, sleeps } = limiter();
    await l.wait('https://a.example/1');
    await l.wait('https://a.example/2');
    await l.wait('https://a.example/3');
    expect(sleeps).toEqual([3000, 3000]);
  });

  it('does not delay different hosts or requests after the interval passed', async () => {
    const { l, sleeps, advance } = limiter();
    await l.wait('https://a.example/1');
    await l.wait('https://b.example/1');
    advance(5000);
    await l.wait('https://a.example/2');
    expect(sleeps).toEqual([]);
  });

  it('uses a larger robots crawl-delay, capped at 60s, and treats www as the same host', async () => {
    const { l, sleeps } = limiter();
    // Each call reserves the gap *after* itself: 10s, 10s, then 60s (600s capped).
    await l.wait('https://www.a.example/1', 10);
    await l.wait('https://a.example/2', 10);
    await l.wait('https://a.example/3', 600);
    await l.wait('https://a.example/4', 600);
    expect(sleeps).toEqual([10_000, 10_000, 60_000]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @cs/collectors exec vitest run src/web`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement**

`packages/collectors/src/web/user-agent.ts`:
```ts
/** Robots.txt product token. Honest identification is a legal/ethical requirement (spec §4.2). */
export const BOT_TOKEN = 'RivalMondayBot';
export const BOT_USER_AGENT = `Mozilla/5.0 (compatible; ${BOT_TOKEN}/1.0; +https://rivalmonday.com/bot)`;

export type FetchText = (url: string) => Promise<{ status: number; body: string }>;

const MAX_BODY = 512 * 1024;

export const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url, {
    headers: { 'user-agent': BOT_USER_AGENT, accept: 'text/plain,text/html,application/xml;q=0.9,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, body: new TextDecoder().decode(buf.subarray(0, MAX_BODY)) };
};

/** Hostname without a leading "www." — rate limits and same-site checks treat both as one site. */
export function siteHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}
```

`packages/collectors/src/web/robots.ts`:
```ts
import robotsParser from 'robots-parser';
import { BOT_TOKEN, type FetchText } from './user-agent';

export interface RobotsVerdict {
  allowed: boolean;
  reason: 'allowed' | 'disallowed' | 'robots_unavailable';
  crawlDelaySeconds: number | null;
  sitemaps: string[];
}

type Parsed = { kind: 'rules'; robots: ReturnType<typeof robotsParser> } | { kind: 'allow_all' } | { kind: 'unavailable' };

/** RFC 9309 semantics: 2xx → rules, 4xx → allow all, 5xx/unreachable → disallow all. */
export class RobotsPolicy {
  private readonly cache = new Map<string, { at: number; parsed: Parsed }>();

  constructor(
    private readonly fetchText: FetchText,
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = 24 * 60 * 60 * 1000,
  ) {}

  async check(url: string): Promise<RobotsVerdict> {
    const origin = new URL(url).origin;
    const parsed = await this.load(origin);
    if (parsed.kind === 'unavailable') return { allowed: false, reason: 'robots_unavailable', crawlDelaySeconds: null, sitemaps: [] };
    if (parsed.kind === 'allow_all') return { allowed: true, reason: 'allowed', crawlDelaySeconds: null, sitemaps: [] };
    const allowed = parsed.robots.isAllowed(url, BOT_TOKEN) !== false;
    return {
      allowed,
      reason: allowed ? 'allowed' : 'disallowed',
      crawlDelaySeconds: parsed.robots.getCrawlDelay(BOT_TOKEN) ?? null,
      sitemaps: parsed.robots.getSitemaps(),
    };
  }

  private async load(origin: string): Promise<Parsed> {
    const hit = this.cache.get(origin);
    if (hit && this.now() - hit.at <= this.ttlMs) return hit.parsed;
    const robotsUrl = `${origin}/robots.txt`;
    let parsed: Parsed;
    try {
      const res = await this.fetchText(robotsUrl);
      if (res.status >= 200 && res.status < 300) parsed = { kind: 'rules', robots: robotsParser(robotsUrl, res.body) };
      else if (res.status >= 400 && res.status < 500) parsed = { kind: 'allow_all' };
      else parsed = { kind: 'unavailable' };
    } catch {
      parsed = { kind: 'unavailable' };
    }
    this.cache.set(origin, { at: this.now(), parsed });
    return parsed;
  }
}
```

`packages/collectors/src/web/rate-limit.ts`:
```ts
import { siteHost } from './user-agent';

export interface RateLimiterOptions {
  minIntervalMs?: number;
  maxCrawlDelayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Politeness: at most one request per interval per site (spec §4.2: ≥ a few seconds per host). */
export class HostRateLimiter {
  private readonly nextSlot = new Map<string, number>();
  private readonly minIntervalMs: number;
  private readonly maxCrawlDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: RateLimiterOptions = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? 3000;
    this.maxCrawlDelayMs = opts.maxCrawlDelayMs ?? 60_000;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async wait(url: string, crawlDelaySeconds?: number | null): Promise<void> {
    const host = siteHost(url);
    const interval = Math.max(this.minIntervalMs, Math.min((crawlDelaySeconds ?? 0) * 1000, this.maxCrawlDelayMs));
    const now = this.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? now);
    // Reserve synchronously so concurrent callers queue behind each other.
    this.nextSlot.set(host, slot + interval);
    if (slot > now) await this.sleep(slot - now);
  }
}
```

`packages/collectors/src/index.ts`:
```ts
export * from './web/rate-limit';
export * from './web/robots';
export * from './web/user-agent';
```

If `robots-parser`'s default-import typing fails under `verbatimModuleSyntax`/Bundler resolution, use `import robotsParser = require(...)` is not allowed in ESM — instead keep the default import and, only if TypeScript errors, add `"esModuleInterop": true` locally in `packages/collectors/tsconfig.json` `compilerOptions`; explain in the report.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @cs/collectors exec vitest run src/web && pnpm --filter @cs/collectors typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/collectors pnpm-lock.yaml
git commit -m "feat(collectors): honest user agent, RFC 9309 robots policy and per-host rate limiter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Playwright renderer, block detection and polite rendering

**Files:**
- Create: `packages/collectors/src/web/blocked.ts`, `renderer.ts`, `polite.ts`; `packages/collectors/test/fixtures-server.ts`
- Modify: `packages/collectors/src/index.ts`
- Test: `packages/collectors/src/web/blocked.test.ts`, `renderer.test.ts`, `polite.test.ts`

**Interfaces:**
- Consumes: `BOT_USER_AGENT`, `RobotsPolicy`, `HostRateLimiter` (Task 4); `CaptureStatus` (Task 3)
- Produces:
  - `type RenderStatus = 'ok' | 'blocked' | 'timeout' | 'error' | 'robots_disallowed'`
  - `interface RenderedPage { requestedUrl: string; finalUrl: string; httpStatus: number | null; status: RenderStatus; title: string; html: string; text: string; links: { href: string; text: string }[]; error: string | null; screenshot(): Promise<Uint8Array>; close(): Promise<void> }`
  - `interface Renderer { render(url: string): Promise<RenderedPage>; close(): Promise<void> }`
  - `createPlaywrightRenderer(opts?: { userAgent?: string; timeoutMs?: number; maxScreenshotHeight?: number }): Renderer` (browser launched lazily on first render)
  - `detectBlocked(httpStatus: number | null, html: string): boolean`
  - `createPoliteRenderer(deps: { robots: RobotsPolicy; limiter: HostRateLimiter; renderer: Renderer }): Renderer`
  - Test helper `startFixtureServer(routes: Record<string, { status?: number; body: string; delayMs?: number; contentType?: string }>): Promise<{ url(path: string): string; close(): Promise<void> }>`

- [ ] **Step 1: Fixture server (test helper)**

`packages/collectors/test/fixtures-server.ts`:
```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Route {
  status?: number;
  body: string;
  delayMs?: number;
  contentType?: string;
}

export async function startFixtureServer(routes: Record<string, Route>) {
  const server = createServer((req, res) => {
    const route = routes[new URL(req.url ?? '/', 'http://x').pathname];
    const send = () => {
      if (!route) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(route.status ?? 200, { 'content-type': route.contentType ?? 'text/html; charset=utf-8' }).end(route.body);
    };
    if (route?.delayMs) setTimeout(send, route.delayMs);
    else send();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
```

- [ ] **Step 2: Write the failing tests**

`packages/collectors/src/web/blocked.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { detectBlocked } from './blocked';

describe('detectBlocked', () => {
  it.each([401, 403, 429])('treats HTTP %i as blocked', (s) => expect(detectBlocked(s, '<html></html>')).toBe(true));
  it('treats challenge pages as blocked even with 200/503', () => {
    expect(detectBlocked(503, '<title>Just a moment...</title>')).toBe(true);
    expect(detectBlocked(200, '<div id="challenge-platform"></div>')).toBe(true);
    expect(detectBlocked(200, '<div class="g-recaptcha">verify you are human</div>')).toBe(true);
  });
  it('does not flag normal pages', () => {
    expect(detectBlocked(200, '<h1>AC tune-up $99</h1>')).toBe(false);
    expect(detectBlocked(null, '')).toBe(false);
  });
});
```

`packages/collectors/src/web/renderer.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServer } from '../../test/fixtures-server';
import { createPlaywrightRenderer } from './renderer';

let server: Awaited<ReturnType<typeof startFixtureServer>>;
const renderer = createPlaywrightRenderer({ timeoutMs: 3000 });

beforeAll(async () => {
  server = await startFixtureServer({
    '/ok': { body: '<html><head><title>Smith HVAC Pricing</title></head><body><h1>AC tune-up $99</h1><a href="/services">Services</a><a href="https://other.example/x">Out</a></body></html>' },
    '/forbidden': { status: 403, body: '<title>Just a moment...</title>' },
    '/slow': { body: '<html>late</html>', delayMs: 10_000 },
  });
});
afterAll(async () => {
  await renderer.close();
  await server.close();
});

describe('Playwright renderer', () => {
  it('renders title, visible text, absolute links and a WebP screenshot', async () => {
    const page = await renderer.render(server.url('/ok'));
    try {
      expect(page).toMatchObject({ status: 'ok', httpStatus: 200, title: 'Smith HVAC Pricing', error: null });
      expect(page.text).toContain('AC tune-up $99');
      expect(page.html).toContain('<h1>AC tune-up $99</h1>');
      expect(page.links).toContainEqual({ href: server.url('/services'), text: 'Services' });
      const shot = await page.screenshot();
      expect(new TextDecoder().decode(shot.subarray(8, 12))).toBe('WEBP');
    } finally {
      await page.close();
    }
  });

  it('flags bot challenges as blocked', async () => {
    const page = await renderer.render(server.url('/forbidden'));
    expect(page).toMatchObject({ status: 'blocked', httpStatus: 403 });
    await page.close();
  });

  it('reports timeouts', async () => {
    const page = await renderer.render(server.url('/slow'));
    expect(page.status).toBe('timeout');
    await page.close();
  });
});
```

`packages/collectors/src/web/polite.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createPoliteRenderer } from './polite';
import { HostRateLimiter } from './rate-limit';
import type { RenderedPage, Renderer } from './renderer';
import { RobotsPolicy } from './robots';

const okPage = (url: string): RenderedPage => ({
  requestedUrl: url, finalUrl: url, httpStatus: 200, status: 'ok', title: '', html: '', text: '', links: [], error: null,
  screenshot: async () => new Uint8Array(), close: async () => {},
});

describe('polite renderer', () => {
  it('does not render robots-disallowed URLs', async () => {
    const inner: Renderer = { render: vi.fn(async (u: string) => okPage(u)), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nDisallow: /secret' }));
    const r = createPoliteRenderer({ robots, limiter: new HostRateLimiter({ sleep: async () => {} }), renderer: inner });
    expect((await r.render('https://site.example/secret/1')).status).toBe('robots_disallowed');
    expect(inner.render).not.toHaveBeenCalled();
    expect((await r.render('https://site.example/public')).status).toBe('ok');
    expect(inner.render).toHaveBeenCalledTimes(1);
  });

  it('waits on the rate limiter with the robots crawl delay before rendering', async () => {
    const order: string[] = [];
    const inner: Renderer = { render: async (u) => { order.push('render'); return okPage(u); }, close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nCrawl-delay: 7' }));
    const limiter = { wait: vi.fn(async () => { order.push('wait'); }) } as unknown as HostRateLimiter;
    await createPoliteRenderer({ robots, limiter, renderer: inner }).render('https://site.example/');
    expect(order).toEqual(['wait', 'render']);
    expect(limiter.wait).toHaveBeenCalledWith('https://site.example/', 7);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @cs/collectors exec vitest run src/web`
Expected: FAIL — modules missing.

- [ ] **Step 4: Implement**

`packages/collectors/src/web/blocked.ts`:
```ts
const CHALLENGE = /just a moment\.\.\.|challenge-platform|cf-browser-verification|captcha|verify you are human|access denied/i;

/** Blocked pages are recorded as such and never retried with other tactics (spec §4.2). */
export function detectBlocked(httpStatus: number | null, html: string): boolean {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return true;
  return CHALLENGE.test(html.slice(0, 20_000));
}
```

`packages/collectors/src/web/renderer.ts`:
```ts
import { type Browser, type BrowserContext, chromium, errors } from 'playwright';
import sharp from 'sharp';
import { detectBlocked } from './blocked';
import { BOT_USER_AGENT } from './user-agent';

export type RenderStatus = 'ok' | 'blocked' | 'timeout' | 'error' | 'robots_disallowed';

export interface RenderedPage {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number | null;
  status: RenderStatus;
  title: string;
  html: string;
  text: string;
  links: { href: string; text: string }[];
  error: string | null;
  /** Full-page WebP screenshot; only call when the content changed (cost). */
  screenshot(): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface Renderer {
  render(url: string): Promise<RenderedPage>;
  close(): Promise<void>;
}

export function emptyPage(url: string, status: RenderStatus, error: string | null, httpStatus: number | null = null): RenderedPage {
  return {
    requestedUrl: url, finalUrl: url, httpStatus, status, title: '', html: '', text: '', links: [], error,
    screenshot: async () => { throw new Error(`No screenshot for a ${status} page`); },
    close: async () => {},
  };
}

export function createPlaywrightRenderer(opts: { userAgent?: string; timeoutMs?: number; maxScreenshotHeight?: number } = {}): Renderer {
  const userAgent = opts.userAgent ?? BOT_USER_AGENT;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxHeight = opts.maxScreenshotHeight ?? 8000;
  let browser: Promise<Browser> | null = null;
  const getBrowser = () => (browser ??= chromium.launch({ headless: true }));

  return {
    async render(url) {
      let context: BrowserContext | null = null;
      try {
        context = await (await getBrowser()).newContext({ userAgent, viewport: { width: 1366, height: 900 } });
        const page = await context.newPage();
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        const httpStatus = response?.status() ?? null;
        const html = await page.content();
        const ctx = context;
        if (detectBlocked(httpStatus, html)) {
          await ctx.close();
          return emptyPage(url, 'blocked', null, httpStatus);
        }
        const title = await page.title();
        const text = await page.evaluate(() => document.body?.innerText ?? '');
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]')).map((a) => ({
            href: (a as HTMLAnchorElement).href,
            text: ((a as HTMLAnchorElement).innerText || a.getAttribute('aria-label') || '').trim().slice(0, 120),
          })),
        );
        return {
          requestedUrl: url, finalUrl: page.url(), httpStatus, status: 'ok', title, html, text, links, error: null,
          async screenshot() {
            const jpeg = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 80 });
            return new Uint8Array(
              await sharp(jpeg).resize({ width: 1366, height: maxHeight, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer(),
            );
          },
          close: () => ctx.close(),
        };
      } catch (err) {
        await context?.close().catch(() => {});
        if (err instanceof errors.TimeoutError) return emptyPage(url, 'timeout', err.message);
        return emptyPage(url, 'error', err instanceof Error ? err.message : String(err));
      }
    },
    async close() {
      if (browser) await (await browser).close();
      browser = null;
    },
  };
}
```
Note: the `page.evaluate` callbacks run in the browser; `document`/`HTMLAnchorElement` need the DOM lib for typechecking — add `"lib": ["ES2023", "DOM"]` to `packages/collectors/tsconfig.json` `compilerOptions`.

`packages/collectors/src/web/polite.ts`:
```ts
import type { HostRateLimiter } from './rate-limit';
import { emptyPage, type Renderer } from './renderer';
import type { RobotsPolicy } from './robots';

/** robots.txt → rate limit → render. Disallowed URLs are never fetched. */
export function createPoliteRenderer(deps: { robots: RobotsPolicy; limiter: HostRateLimiter; renderer: Renderer }): Renderer {
  return {
    async render(url) {
      const verdict = await deps.robots.check(url);
      if (!verdict.allowed) return emptyPage(url, 'robots_disallowed', verdict.reason);
      await deps.limiter.wait(url, verdict.crawlDelaySeconds);
      return deps.renderer.render(url);
    },
    close: () => deps.renderer.close(),
  };
}
```

`packages/collectors/src/index.ts` — add:
```ts
export * from './web/blocked';
export * from './web/polite';
export * from './web/renderer';
```

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @cs/collectors exec vitest run src/web && pnpm --filter @cs/collectors typecheck`
Expected: PASS (renderer tests launch real chromium against the local fixture server).

- [ ] **Step 6: Commit**

```bash
git add packages/collectors
git commit -m "feat(collectors): Playwright renderer with block detection and polite rendering

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Evidence recorder (hash-first, immutable)

**Files:**
- Create: `packages/collectors/src/evidence/recorder.ts`; Modify: `packages/collectors/src/index.ts`
- Test: `packages/collectors/src/evidence/recorder.test.ts`

**Interfaces:**
- Consumes: `Db` (service role), tables `capture`, `evidence`, `trackedPage` (Task 3); `ObjectStore` (Task 2); `RenderedPage` (Task 5)
- Produces:
  - `WEB_COLLECTOR_VERSION = 'web/1'`
  - `normalizeText(text: string): string` (collapse runs of whitespace to single spaces/newlines, trim)
  - `sha256Hex(data: Uint8Array | string): string`
  - `recordWebCapture(deps: { db: Db; store: ObjectStore; now?: () => Date }, input: { trackedPage: { id: string; competitorId: string; url: string }; page: RenderedPage }): Promise<{ captureId: string; status: CaptureStatus; evidenceKeys: string[] }>`
  - Object keys: `evidence/{competitorId}/{captureId}/page.html.gz`, `.../text.txt`, `.../screenshot.webp`

- [ ] **Step 1: Write the failing test**

`packages/collectors/src/evidence/recorder.test.ts`:
```ts
import { capture, evidence, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderedPage } from '../web/renderer';
import { recordWebCapture } from './recorder';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const PAGE = '00000000-0000-4000-8000-0000000000e1';
const tp = { id: PAGE, competitorId: IDS.competitorX, url: 'https://smithhvac.example/pricing' };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ ...tp, pageType: 'pricing', source: 'sitemap', cadence: 'daily' });
});

let t = Date.parse('2026-10-01T06:00:00Z');
const now = () => new Date((t += 60_000));

function page(text: string, overrides: Partial<RenderedPage> = {}): RenderedPage & { screenshot: ReturnType<typeof vi.fn> } {
  return {
    requestedUrl: tp.url, finalUrl: tp.url, httpStatus: 200, status: 'ok', title: 'Pricing',
    html: `<html><body>${text}</body></html>`, text, links: [], error: null,
    screenshot: vi.fn(async () => new Uint8Array([0x52, 0x49, 0x46, 0x46])),
    close: async () => {},
    ...overrides,
  } as RenderedPage & { screenshot: ReturnType<typeof vi.fn> };
}

describe('recordWebCapture', () => {
  it('stores html, text and screenshot for a new page', async () => {
    const store = createMemoryStore();
    const p = page('AC tune-up $99');
    const r = await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: p });
    expect(r.status).toBe('ok');
    expect(r.evidenceKeys).toEqual([
      `evidence/${IDS.competitorX}/${r.captureId}/page.html.gz`,
      `evidence/${IDS.competitorX}/${r.captureId}/text.txt`,
      `evidence/${IDS.competitorX}/${r.captureId}/screenshot.webp`,
    ]);
    const rows = await dbs.service.select().from(evidence).where(eq(evidence.captureId, r.captureId));
    expect(rows.map((e) => e.kind).sort()).toEqual(['html', 'screenshot', 'text']);
    expect(rows.every((e) => /^[0-9a-f]{64}$/.test(e.sha256))).toBe(true);
    expect(gunzipSync(Buffer.from((await store.get(r.evidenceKeys[0] as string)) ?? [])).toString()).toContain('AC tune-up $99');
    const [tpRow] = await dbs.service.select().from(trackedPage).where(eq(trackedPage.id, PAGE));
    expect(tpRow?.lastCapturedAt).not.toBeNull();
  });

  it('records unchanged (no objects, no screenshot) when visible text is the same', async () => {
    const store = createMemoryStore();
    await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: page('AC tune-up $99') });
    const put = vi.spyOn(store, 'put');
    const again = page('  AC   tune-up $99 \n');
    const r = await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: again });
    expect(r).toMatchObject({ status: 'unchanged', evidenceKeys: [] });
    expect(put).not.toHaveBeenCalled();
    expect(again.screenshot).not.toHaveBeenCalled();
  });

  it('stores a new capture when the text changes', async () => {
    const store = createMemoryStore();
    await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: page('AC tune-up $99') });
    const r = await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: page('AC tune-up $79') });
    expect(r.status).toBe('ok');
    expect(r.evidenceKeys).toHaveLength(3);
  });

  it('records blocked/timeout/robots statuses without evidence', async () => {
    const store = createMemoryStore();
    for (const status of ['blocked', 'timeout', 'robots_disallowed', 'error'] as const) {
      const r = await recordWebCapture({ db: dbs.service, store, now }, { trackedPage: tp, page: page('', { status, httpStatus: status === 'blocked' ? 403 : null, error: status === 'error' ? 'boom' : null }) });
      expect(r).toMatchObject({ status, evidenceKeys: [] });
    }
    const caps = await dbs.service.select().from(capture).where(eq(capture.trackedPageId, PAGE));
    expect(caps.map((c) => c.status).sort()).toEqual(['blocked', 'error', 'robots_disallowed', 'timeout']);
    expect(await dbs.service.select().from(evidence)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cs/collectors exec vitest run src/evidence`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`packages/collectors/src/evidence/recorder.ts`:
```ts
import type { CaptureStatus } from '@cs/core';
import { capture, type Db, evidence, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { RenderedPage } from '../web/renderer';

export const WEB_COLLECTOR_VERSION = 'web/1';

export function normalizeText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface RecorderDeps {
  db: Db;
  store: ObjectStore;
  now?: () => Date;
}

export interface WebCaptureInput {
  trackedPage: { id: string; competitorId: string; url: string };
  page: RenderedPage;
}

/** Hash-first, immutable capture: unchanged text → no objects and no screenshot (spec §4.2, §4.4). */
export async function recordWebCapture(deps: RecorderDeps, input: WebCaptureInput): Promise<{ captureId: string; status: CaptureStatus; evidenceKeys: string[] }> {
  const now = deps.now ?? (() => new Date());
  const { trackedPage: tp, page } = input;
  const captureId = randomUUID();
  const base = { id: captureId, competitorId: tp.competitorId, trackedPageId: tp.id, source: 'web', url: page.finalUrl, httpStatus: page.httpStatus, collectorVersion: WEB_COLLECTOR_VERSION };

  if (page.status !== 'ok') {
    await deps.db.insert(capture).values({ ...base, status: page.status, error: page.error, capturedAt: now() });
    return { captureId, status: page.status, evidenceKeys: [] };
  }

  const text = normalizeText(page.text);
  const textSha = sha256Hex(text);
  const [last] = await deps.db
    .select({ sha: evidence.sha256 })
    .from(capture)
    .innerJoin(evidence, and(eq(evidence.captureId, capture.id), eq(evidence.kind, 'text')))
    .where(and(eq(capture.trackedPageId, tp.id), eq(capture.status, 'ok')))
    .orderBy(desc(capture.capturedAt))
    .limit(1);

  const capturedAt = now();
  if (last?.sha === textSha) {
    await deps.db.insert(capture).values({ ...base, status: 'unchanged', capturedAt });
    await deps.db.update(trackedPage).set({ lastCapturedAt: capturedAt }).where(eq(trackedPage.id, tp.id));
    return { captureId, status: 'unchanged', evidenceKeys: [] };
  }

  const prefix = `evidence/${tp.competitorId}/${captureId}`;
  const htmlGz = new Uint8Array(gzipSync(page.html));
  const textBytes = new TextEncoder().encode(text);
  const shot = await page.screenshot();
  const objects = [
    { kind: 'html', key: `${prefix}/page.html.gz`, body: htmlGz, contentType: 'application/gzip', sha: sha256Hex(page.html) },
    { kind: 'text', key: `${prefix}/text.txt`, body: textBytes, contentType: 'text/plain; charset=utf-8', sha: textSha },
    { kind: 'screenshot', key: `${prefix}/screenshot.webp`, body: shot, contentType: 'image/webp', sha: sha256Hex(shot) },
  ];
  // Upload first; a failed DB write can leave orphan objects, which is safe (never referenced) and cheap.
  for (const o of objects) await deps.store.put(o.key, o.body, o.contentType);

  await deps.db.transaction(async (tx) => {
    await tx.insert(capture).values({ ...base, status: 'ok', capturedAt });
    await tx.insert(evidence).values(
      objects.map((o) => ({ captureId, kind: o.kind, objectKey: o.key, sha256: o.sha, bytes: o.body.byteLength, contentType: o.contentType })),
    );
    await tx.update(trackedPage).set({ lastCapturedAt: capturedAt }).where(eq(trackedPage.id, tp.id));
  });
  return { captureId, status: 'ok', evidenceKeys: objects.map((o) => o.key) };
}
```
Note: the `html` evidence `sha256` is the hash of the raw HTML (before gzip), so identical pages hash identically regardless of gzip settings.

`packages/collectors/src/index.ts` — add `export * from './evidence/recorder';`

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @cs/collectors exec vitest run src/evidence && pnpm --filter @cs/collectors typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/collectors
git commit -m "feat(collectors): hash-first immutable evidence recorder

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Page discovery (sitemaps, navigation, classification, selection)

**Files:**
- Create: `packages/collectors/src/discovery/urls.ts`, `sitemap.ts`, `classify.ts`, `select.ts`, `discover.ts`; Modify: `packages/collectors/src/index.ts`
- Test: `packages/collectors/src/discovery/urls.test.ts`, `sitemap.test.ts`, `select.test.ts`, `discover.test.ts`

**Interfaces:**
- Consumes: `Ai` (`@cs/ai`: `decide(task, state, questions, scope)` → `{ answers, needsReview }`); `Renderer` (polite), `RobotsPolicy`, `FetchText` (Tasks 4–5); `trackedPage` (Task 3); `PAGE_TYPES`, `PageType`, `Cadence` (core)
- Produces:
  - `normalizeUrl(raw: string, site: string): string | null` — same site only (www-insensitive), http(s) only, no fragment, tracking params (`utm_*`, `gclid`, `fbclid`, `msclkid`) removed, no trailing slash except root, lowercase host, skips binary file extensions
  - `parseSitemap(xml: string): { urls: string[]; sitemaps: string[] }`
  - `collectSitemapUrls(fetchText: FetchText, sitemapUrls: string[], opts?: { maxUrls?: number; maxDepth?: number }): Promise<string[]>`
  - `guessPageType(url: string, linkText?: string): PageType | null` (keyword heuristic, used for prefiltering and as a hint)
  - `PAGE_TYPE_OPTIONS: Record<PageType, string>` (descriptions for the classifier)
  - `classifyPage(ai: Ai, candidate: { url: string; text?: string }): Promise<{ pageType: PageType; needsReview: boolean }>`
  - `selectPages(pages: { url: string; pageType: PageType; source: 'sitemap' | 'nav' }[], max?: number): { url; pageType; source; cadence: Cadence }[]`
  - `discoverPages(deps: { db: Db; renderer: Renderer; robots: RobotsPolicy; fetchText: FetchText; ai: Ai }, competitor: { id: string; domain: string }, opts?: { max?: number; maxCandidates?: number }): Promise<{ selected: number; candidates: number; homepageStatus: RenderStatus }>`

- [ ] **Step 1: Write the failing tests**

`packages/collectors/src/discovery/urls.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { guessPageType, normalizeUrl } from './urls';

describe('normalizeUrl', () => {
  const site = 'smithhvac.example';
  it.each([
    ['https://www.smithhvac.example/Pricing/?utm_source=x&b=1#top', 'https://www.smithhvac.example/Pricing?b=1'],
    ['https://smithhvac.example/', 'https://smithhvac.example/'],
    ['http://SMITHHVAC.example/services/ac/', 'http://smithhvac.example/services/ac'],
  ])('%s → %s', (input, out) => expect(normalizeUrl(input, site)).toBe(out));
  it.each(['https://other.example/', 'mailto:a@b.c', 'tel:123', 'https://smithhvac.example/brochure.pdf', 'https://smithhvac.example/logo.PNG', 'not a url'])('rejects %s', (u) =>
    expect(normalizeUrl(u, site)).toBeNull(),
  );
});

describe('guessPageType', () => {
  it.each([
    ['https://s.example/', undefined, 'home'],
    ['https://s.example/pricing', undefined, 'pricing'],
    ['https://s.example/specials', undefined, 'promo'],
    ['https://s.example/service-area/brookhaven', undefined, 'service_area'],
    ['https://s.example/careers', undefined, 'careers'],
    ['https://s.example/blog/5-signs', undefined, 'blog'],
    ['https://s.example/x', 'Our Team', 'team'],
    ['https://s.example/ac-repair', undefined, null],
  ])('%s (%s) → %s', (u, text, type) => expect(guessPageType(u, text)).toBe(type));
});
```

`packages/collectors/src/discovery/sitemap.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { collectSitemapUrls, parseSitemap } from './sitemap';

const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://s.example/pages.xml</loc></sitemap></sitemapindex>`;
const pages = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://s.example/</loc></url><url><loc>https://s.example/pricing</loc></url></urlset>`;
const single = `<urlset><url><loc>https://s.example/only</loc></url></urlset>`;

describe('parseSitemap', () => {
  it('parses url sets (single and multiple) and indexes', () => {
    expect(parseSitemap(pages)).toEqual({ urls: ['https://s.example/', 'https://s.example/pricing'], sitemaps: [] });
    expect(parseSitemap(single).urls).toEqual(['https://s.example/only']);
    expect(parseSitemap(index)).toEqual({ urls: [], sitemaps: ['https://s.example/pages.xml'] });
    expect(parseSitemap('garbage')).toEqual({ urls: [], sitemaps: [] });
  });
});

describe('collectSitemapUrls', () => {
  it('follows indexes, caps results and tolerates failures', async () => {
    const fetchText = vi.fn(async (u: string) => {
      if (u.endsWith('/sitemap.xml')) return { status: 200, body: index };
      if (u.endsWith('/pages.xml')) return { status: 200, body: pages };
      throw new Error('down');
    });
    expect(await collectSitemapUrls(fetchText, ['https://s.example/sitemap.xml', 'https://s.example/broken.xml'])).toEqual([
      'https://s.example/', 'https://s.example/pricing',
    ]);
    expect(await collectSitemapUrls(fetchText, ['https://s.example/sitemap.xml'], { maxUrls: 1 })).toHaveLength(1);
  });
});
```

`packages/collectors/src/discovery/select.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { selectPages } from './select';

describe('selectPages', () => {
  it('prioritises high-signal types, caps blog pages, drops other, assigns cadence', () => {
    const pages = [
      { url: 'https://s.example/blog/1', pageType: 'blog' as const, source: 'sitemap' as const },
      { url: 'https://s.example/blog/2', pageType: 'blog' as const, source: 'sitemap' as const },
      { url: 'https://s.example/blog/3', pageType: 'blog' as const, source: 'sitemap' as const },
      { url: 'https://s.example/x', pageType: 'other' as const, source: 'nav' as const },
      { url: 'https://s.example/careers', pageType: 'careers' as const, source: 'nav' as const },
      { url: 'https://s.example/pricing', pageType: 'pricing' as const, source: 'nav' as const },
      { url: 'https://s.example/', pageType: 'home' as const, source: 'nav' as const },
    ];
    const out = selectPages(pages);
    expect(out.map((p) => p.url)).toEqual([
      'https://s.example/', 'https://s.example/pricing', 'https://s.example/careers', 'https://s.example/blog/1', 'https://s.example/blog/2',
    ]);
    expect(out.find((p) => p.pageType === 'pricing')?.cadence).toBe('daily');
    expect(out.find((p) => p.pageType === 'careers')?.cadence).toBe('weekly');
    expect(selectPages(pages, 2)).toHaveLength(2);
  });
});
```

`packages/collectors/src/discovery/discover.test.ts`:
```ts
import type { Ai } from '@cs/ai';
import { trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderedPage, Renderer } from '../web/renderer';
import { RobotsPolicy } from '../web/robots';
import { discoverPages } from './discover';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const home: RenderedPage = {
  requestedUrl: 'https://smithhvac.example/', finalUrl: 'https://smithhvac.example/', httpStatus: 200, status: 'ok', title: 'Smith HVAC',
  html: '', text: '', error: null,
  links: [
    { href: 'https://smithhvac.example/pricing', text: 'Pricing' },
    { href: 'https://smithhvac.example/ac-repair', text: 'AC Repair' },
    { href: 'https://facebook.com/smith', text: 'Facebook' },
  ],
  screenshot: async () => new Uint8Array(), close: async () => {},
};

function fakeAi(types: Record<string, string>): Ai {
  return {
    chat: async () => { throw new Error('not used'); },
    decide: vi.fn(async (_task: string, state: unknown) => {
      const url = (state as { url: string }).url;
      const value = types[url] ?? 'other';
      return { answers: { page_type: { type: 'choice', value, probabilities: { [value]: 0.95 }, confidence: 0.95, provider: 'jev' } }, needsReview: [] };
    }) as unknown as Ai['decide'],
  };
}

describe('discoverPages', () => {
  it('collects nav + sitemap candidates, classifies, selects and upserts tracked pages', async () => {
    const renderer: Renderer = { render: vi.fn(async () => home), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 200, body: 'User-agent: *\nSitemap: https://smithhvac.example/sitemap.xml' }));
    const fetchText = vi.fn(async () => ({ status: 200, body: '<urlset><url><loc>https://smithhvac.example/specials</loc></url></urlset>' }));
    const ai = fakeAi({
      'https://smithhvac.example/': 'home',
      'https://smithhvac.example/pricing': 'pricing',
      'https://smithhvac.example/ac-repair': 'service',
      'https://smithhvac.example/specials': 'promo',
    });
    const result = await discoverPages({ db: dbs.service, renderer, robots, fetchText, ai }, { id: IDS.competitorX, domain: 'smithhvac.example' });
    expect(result).toMatchObject({ selected: 4, homepageStatus: 'ok' });
    const rows = await dbs.service.select().from(trackedPage).where(eq(trackedPage.competitorId, IDS.competitorX));
    expect(rows.map((r) => [r.url, r.pageType, r.cadence]).sort()).toEqual([
      ['https://smithhvac.example/', 'home', 'daily'],
      ['https://smithhvac.example/ac-repair', 'service', 'weekly'],
      ['https://smithhvac.example/pricing', 'pricing', 'daily'],
      ['https://smithhvac.example/specials', 'promo', 'daily'],
    ]);

    // Re-running does not duplicate rows and keeps pinned pages' type.
    await dbs.service.update(trackedPage).set({ pinned: true, pageType: 'service_area' }).where(eq(trackedPage.url, 'https://smithhvac.example/ac-repair'));
    await discoverPages({ db: dbs.service, renderer, robots, fetchText, ai }, { id: IDS.competitorX, domain: 'smithhvac.example' });
    const again = await dbs.service.select().from(trackedPage).where(eq(trackedPage.competitorId, IDS.competitorX));
    expect(again).toHaveLength(4);
    expect(again.find((r) => r.url.endsWith('/ac-repair'))?.pageType).toBe('service_area');
  });

  it('records nothing when the homepage is blocked', async () => {
    const renderer: Renderer = { render: async () => ({ ...home, status: 'blocked', links: [] }), close: async () => {} };
    const robots = new RobotsPolicy(async () => ({ status: 404, body: '' }));
    const result = await discoverPages(
      { db: dbs.service, renderer, robots, fetchText: async () => ({ status: 404, body: '' }), ai: fakeAi({}) },
      { id: IDS.competitorX, domain: 'smithhvac.example' },
    );
    expect(result).toMatchObject({ selected: 0, homepageStatus: 'blocked' });
    expect(await dbs.service.select().from(trackedPage)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/collectors exec vitest run src/discovery`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`packages/collectors/src/discovery/urls.ts`:
```ts
import type { PageType } from '@cs/core';

const TRACKING = /^(utm_|gclid$|fbclid$|msclkid$)/i;
const BINARY = /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|docx?|xlsx?|pptx?|mp4|mp3|mov|avi|css|js|xml|json)$/i;
const bare = (host: string) => host.toLowerCase().replace(/^www\./, '');

export function normalizeUrl(raw: string, site: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (bare(u.hostname) !== bare(site)) return null;
  if (BINARY.test(u.pathname)) return null;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

const RULES: [PageType, RegExp][] = [
  ['pricing', /pric|rates|cost|fees/i],
  ['promo', /special|offer|coupon|deal|promo|discount|financing/i],
  ['service_area', /service-?area|areas-?(we-)?serve|locations?\b|cities|near-me/i],
  ['careers', /career|jobs|join-?(our-)?team|hiring|employment/i],
  ['team', /\bteam\b|our-?people|staff|meet-/i],
  ['about', /about/i],
  ['contact', /contact/i],
  ['blog', /blog|news|articles|tips/i],
];

/** Cheap keyword hint used to prefilter candidates; the classifier makes the final call. */
export function guessPageType(url: string, linkText?: string): PageType | null {
  const path = new URL(url).pathname;
  if (path === '/' || path === '') return 'home';
  const haystack = `${path} ${linkText ?? ''}`;
  for (const [type, re] of RULES) if (re.test(haystack)) return type;
  return null;
}
```

`packages/collectors/src/discovery/sitemap.ts`:
```ts
import { XMLParser } from 'fast-xml-parser';
import type { FetchText } from '../web/user-agent';

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });
const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const locs = (entries: unknown): string[] =>
  asArray(entries as { loc?: unknown } | { loc?: unknown }[])
    .map((e) => (typeof e?.loc === 'string' ? e.loc.trim() : ''))
    .filter(Boolean);

export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  let doc: Record<string, { url?: unknown; sitemap?: unknown }>;
  try {
    doc = parser.parse(xml);
  } catch {
    return { urls: [], sitemaps: [] };
  }
  return { urls: locs(doc?.urlset?.url), sitemaps: locs(doc?.sitemapindex?.sitemap) };
}

export async function collectSitemapUrls(fetchText: FetchText, sitemapUrls: string[], opts: { maxUrls?: number; maxDepth?: number } = {}): Promise<string[]> {
  const maxUrls = opts.maxUrls ?? 500;
  const maxDepth = opts.maxDepth ?? 2;
  const seen = new Set<string>();
  const out = new Set<string>();
  let frontier = [...new Set(sitemapUrls)];
  for (let depth = 0; depth <= maxDepth && frontier.length > 0 && out.size < maxUrls; depth++) {
    const next: string[] = [];
    for (const sm of frontier) {
      if (seen.has(sm) || out.size >= maxUrls) continue;
      seen.add(sm);
      try {
        const res = await fetchText(sm);
        if (res.status < 200 || res.status >= 300) continue;
        const parsed = parseSitemap(res.body);
        for (const u of parsed.urls) if (out.size < maxUrls) out.add(u);
        next.push(...parsed.sitemaps);
      } catch {
        // one broken sitemap must not abort discovery
      }
    }
    frontier = next;
  }
  return [...out];
}
```

`packages/collectors/src/discovery/classify.ts`:
```ts
import type { Ai } from '@cs/ai';
import { PAGE_TYPES, type PageType } from '@cs/core';

export const PAGE_TYPE_OPTIONS: Record<PageType, string> = {
  home: 'Homepage of the business',
  pricing: 'Prices, rates, fees or cost of services',
  service: 'A page describing one service or a list of services offered',
  service_area: 'Towns, cities, ZIP codes or areas the business serves',
  promo: 'Specials, coupons, discounts, seasonal offers or financing offers',
  careers: 'Job openings, hiring or careers',
  team: 'Staff, team members, technicians or doctors',
  about: 'About the company, history, values',
  contact: 'Contact details, booking or appointment form',
  blog: 'Blog post, article, news or tips',
  other: 'Anything else (legal pages, privacy policy, login, galleries, reviews pages)',
};

/** Platform-level decision (not attributed to a tenant). Low confidence → needsReview. */
export async function classifyPage(ai: Ai, candidate: { url: string; text?: string }): Promise<{ pageType: PageType; needsReview: boolean }> {
  const result = await ai.decide(
    'decisions',
    { url: candidate.url, link_text: candidate.text ?? null },
    { page_type: { type: 'choice', instructions: 'What kind of page on a local service business website is this, judging by its URL and link text?', options: PAGE_TYPE_OPTIONS } },
    { agencyId: null, clientId: null },
  );
  const value = result.answers.page_type.value;
  const pageType = (PAGE_TYPES as readonly string[]).includes(String(value)) ? (value as PageType) : 'other';
  return { pageType, needsReview: result.needsReview.length > 0 };
}
```

`packages/collectors/src/discovery/select.ts`:
```ts
import type { Cadence, PageType } from '@cs/core';

const PRIORITY: PageType[] = ['home', 'pricing', 'promo', 'service_area', 'service', 'careers', 'team', 'about', 'contact', 'blog'];
const DAILY: ReadonlySet<PageType> = new Set(['home', 'pricing', 'promo']);
const MAX_BLOG = 2;

export interface CandidatePage {
  url: string;
  pageType: PageType;
  source: 'sitemap' | 'nav';
}

export function selectPages(pages: CandidatePage[], max = 25): (CandidatePage & { cadence: Cadence })[] {
  const byUrl = new Map<string, CandidatePage>();
  for (const p of pages) if (!byUrl.has(p.url)) byUrl.set(p.url, p);
  const out: (CandidatePage & { cadence: Cadence })[] = [];
  for (const type of PRIORITY) {
    const ofType = [...byUrl.values()].filter((p) => p.pageType === type);
    const limit = type === 'blog' ? MAX_BLOG : ofType.length;
    for (const p of ofType.slice(0, limit)) {
      if (out.length >= max) return out;
      out.push({ ...p, cadence: DAILY.has(type) ? 'daily' : 'weekly' });
    }
  }
  return out;
}
```

`packages/collectors/src/discovery/discover.ts`:
```ts
import type { Ai } from '@cs/ai';
import { type Db, trackedPage } from '@cs/db';
import { sql } from 'drizzle-orm';
import type { Renderer, RenderStatus } from '../web/renderer';
import type { RobotsPolicy } from '../web/robots';
import type { FetchText } from '../web/user-agent';
import { classifyPage } from './classify';
import { type CandidatePage, selectPages } from './select';
import { collectSitemapUrls } from './sitemap';
import { guessPageType, normalizeUrl } from './urls';

export interface DiscoveryDeps {
  db: Db;
  renderer: Renderer;
  robots: RobotsPolicy;
  fetchText: FetchText;
  ai: Ai;
}

export async function discoverPages(
  deps: DiscoveryDeps,
  competitor: { id: string; domain: string },
  opts: { max?: number; maxCandidates?: number } = {},
): Promise<{ selected: number; candidates: number; homepageStatus: RenderStatus }> {
  const homeUrl = `https://${competitor.domain}/`;
  const home = await deps.renderer.render(homeUrl);
  try {
    if (home.status !== 'ok') return { selected: 0, candidates: 0, homepageStatus: home.status };

    const candidates = new Map<string, { url: string; text?: string; source: 'sitemap' | 'nav' }>();
    const homeNorm = normalizeUrl(home.finalUrl, competitor.domain) ?? homeUrl;
    candidates.set(homeNorm, { url: homeNorm, text: 'Home', source: 'nav' });
    for (const link of home.links) {
      const u = normalizeUrl(link.href, competitor.domain);
      if (u && !candidates.has(u)) candidates.set(u, { url: u, text: link.text, source: 'nav' });
    }
    const verdict = await deps.robots.check(homeUrl);
    const sitemapSeeds = verdict.sitemaps.length > 0 ? verdict.sitemaps : [`https://${competitor.domain}/sitemap.xml`];
    for (const raw of await collectSitemapUrls(deps.fetchText, sitemapSeeds)) {
      const u = normalizeUrl(raw, competitor.domain);
      if (u && !candidates.has(u)) candidates.set(u, { url: u, source: 'sitemap' });
    }

    // Prefilter: nav links and keyword-matching URLs first, so classification cost stays bounded.
    const ranked = [...candidates.values()].sort((a, b) => score(b) - score(a)).slice(0, opts.maxCandidates ?? 60);
    const classified: CandidatePage[] = [];
    for (const c of ranked) {
      const { pageType } = await classifyPage(deps.ai, c);
      classified.push({ url: c.url, pageType, source: c.source });
    }
    const selected = selectPages(classified, opts.max ?? 25);

    if (selected.length > 0) {
      await deps.db
        .insert(trackedPage)
        .values(selected.map((p) => ({ competitorId: competitor.id, url: p.url, pageType: p.pageType, source: p.source, cadence: p.cadence })))
        .onConflictDoUpdate({
          target: [trackedPage.competitorId, trackedPage.url],
          // Pinned pages keep the type/cadence an account manager chose.
          set: {
            pageType: sql`CASE WHEN ${trackedPage.pinned} THEN ${trackedPage.pageType} ELSE excluded.page_type END`,
            cadence: sql`CASE WHEN ${trackedPage.pinned} THEN ${trackedPage.cadence} ELSE excluded.cadence END`,
            active: sql`true`,
          },
        });
    }
    return { selected: selected.length, candidates: candidates.size, homepageStatus: 'ok' };
  } finally {
    await home.close();
  }
}

function score(c: { url: string; text?: string; source: 'sitemap' | 'nav' }): number {
  return (c.source === 'nav' ? 2 : 0) + (guessPageType(c.url, c.text) ? 3 : 0);
}
```

`packages/collectors/src/index.ts` — add:
```ts
export * from './discovery/classify';
export * from './discovery/discover';
export * from './discovery/select';
export * from './discovery/sitemap';
export * from './discovery/urls';
```
Add `"@cs/ai": "workspace:*"` is already in dependencies (Task 4).

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @cs/collectors exec vitest run src/discovery && pnpm --filter @cs/collectors typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/collectors
git commit -m "feat(collectors): page discovery from navigation and sitemaps with AI classification

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Due-page claiming, page capture, and worker jobs

**Files:**
- Create: `packages/collectors/src/schedule/due-pages.ts`, `packages/collectors/src/capture/capture-page.ts`; Modify: `packages/collectors/src/index.ts`
- Create: `apps/worker/src/deps.ts`, `apps/worker/src/jobs/web.ts`; Modify: `apps/worker/src/main.ts`, `apps/worker/package.json`
- Test: `packages/collectors/src/schedule/due-pages.test.ts`, `packages/collectors/src/capture/capture-page.test.ts`, `apps/worker/src/jobs/web.test.ts`

**Interfaces:**
- Consumes: Tasks 2–7; `createAiFromEnv`, `loadAiConfigFile`, `DEFAULT_AI_CONFIG_PATH` (`@cs/ai`); `createDb`, `createLedgerSink` (`@cs/db`); `defineJob`, `enqueue` (worker)
- Produces:
  - `claimDuePages(db: Db, limit: number): Promise<string[]>` — atomically moves `next_due_at` forward (daily +1 day, weekly +7 days) for up to `limit` due active pages and returns their ids; concurrent callers never get the same id (`FOR UPDATE SKIP LOCKED`)
  - `capturePage(deps: { db: Db; store: ObjectStore; renderer: Renderer }, trackedPageId: string): Promise<{ status: CaptureStatus | 'missing' }>` — loads the page (skips inactive/missing), renders politely (the renderer passed in is the polite one), records, closes the page
  - Worker: `WorkerDeps` + `createWorkerDeps(env): WorkerDeps` (lazy); `createWebJobs(deps, enqueueFn)` returning job definitions `web-schedule` (cron `*/15 * * * *`), `web-capture-page` (`{ trackedPageId: uuid }`), `discover-pages` (`{ competitorId: uuid }`)

- [ ] **Step 1: Write the failing tests**

`packages/collectors/src/schedule/due-pages.test.ts`:
```ts
import { trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimDuePages } from './due-pages';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const base = { competitorId: IDS.competitorX, pageType: 'pricing', source: 'nav' };
  await dbs.service.insert(trackedPage).values([
    { ...base, url: 'https://s.example/due-daily', cadence: 'daily', nextDueAt: sql`now() - interval '1 minute'` },
    { ...base, url: 'https://s.example/due-weekly', cadence: 'weekly', nextDueAt: sql`now() - interval '1 hour'` },
    { ...base, url: 'https://s.example/future', cadence: 'daily', nextDueAt: sql`now() + interval '1 hour'` },
    { ...base, url: 'https://s.example/inactive', cadence: 'daily', active: false, nextDueAt: sql`now() - interval '1 hour'` },
  ]);
});

describe('claimDuePages', () => {
  it('claims only due active pages and advances their next_due_at by cadence', async () => {
    const claimed = await claimDuePages(dbs.service, 10);
    expect(claimed).toHaveLength(2);
    expect(await claimDuePages(dbs.service, 10)).toEqual([]);
    const rows = (await dbs.service.execute(sql`
      SELECT url, round(extract(epoch FROM (next_due_at - now())) / 3600) AS hours FROM tracked_page
       WHERE id = ANY(ARRAY[${sql.join(claimed.map((id) => sql`${id}`), sql`, `)}]::uuid[]) ORDER BY url`)) as unknown as { url: string; hours: string }[];
    expect(rows.map((r) => [r.url, Number(r.hours)])).toEqual([
      ['https://s.example/due-daily', 24],
      ['https://s.example/due-weekly', 168],
    ]);
  });

  it('never hands the same page to concurrent claimers', async () => {
    const [a, b] = await Promise.all([claimDuePages(dbs.service, 10), claimDuePages(dbs.service, 10)]);
    expect([...a, ...b].sort()).toHaveLength(2);
    expect(new Set([...a, ...b]).size).toBe(2);
  });

  it('respects the limit', async () => {
    expect(await claimDuePages(dbs.service, 1)).toHaveLength(1);
  });
});
```

`packages/collectors/src/capture/capture-page.test.ts`:
```ts
import { capture, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderedPage, Renderer } from '../web/renderer';
import { capturePage } from './capture-page';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const PAGE = '00000000-0000-4000-8000-0000000000e1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://s.example/pricing', pageType: 'pricing', source: 'nav', cadence: 'daily' });
});

describe('capturePage', () => {
  it('renders the tracked page, records the capture and closes the page', async () => {
    const close = vi.fn(async () => {});
    const page: RenderedPage = {
      requestedUrl: 'https://s.example/pricing', finalUrl: 'https://s.example/pricing', httpStatus: 200, status: 'ok', title: 'P',
      html: '<p>$99</p>', text: '$99', links: [], error: null, screenshot: async () => new Uint8Array([1]), close,
    };
    const renderer: Renderer = { render: vi.fn(async () => page), close: async () => {} };
    expect(await capturePage({ db: dbs.service, store: createMemoryStore(), renderer }, PAGE)).toEqual({ status: 'ok' });
    expect(renderer.render).toHaveBeenCalledWith('https://s.example/pricing');
    expect(close).toHaveBeenCalled();
    expect(await dbs.service.select().from(capture)).toHaveLength(1);
  });

  it('skips missing pages', async () => {
    const renderer: Renderer = { render: vi.fn(), close: async () => {} };
    expect(await capturePage({ db: dbs.service, store: createMemoryStore(), renderer }, '00000000-0000-4000-8000-000000000000')).toEqual({ status: 'missing' });
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
```

`apps/worker/src/jobs/web.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createWebJobs } from './web';

describe('web jobs', () => {
  it('schedule job enqueues a capture job per claimed page', async () => {
    const enqueueCapture = vi.fn(async () => {});
    const deps = { claimDuePages: vi.fn(async () => ['p1', 'p2']) } as unknown as WorkerDeps;
    const jobs = createWebJobs(deps, { enqueueCapture });
    expect(jobs.schedule.name).toBe('web-schedule');
    expect(jobs.schedule.cron).toBe('*/15 * * * *');
    await jobs.schedule.handler({});
    expect(enqueueCapture.mock.calls.map((c) => c[0])).toEqual(['p1', 'p2']);
  });

  it('validates payloads of capture and discovery jobs', () => {
    const jobs = createWebJobs({} as WorkerDeps, { enqueueCapture: async () => {} });
    expect(() => jobs.capture.schema.parse({ trackedPageId: 'nope' })).toThrow();
    expect(() => jobs.discover.schema.parse({ competitorId: '00000000-0000-4000-8000-0000000000f1' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cs/collectors exec vitest run src/schedule src/capture` and `pnpm --filter @cs/worker exec vitest run src/jobs/web.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement collectors pieces**

`packages/collectors/src/schedule/due-pages.ts`:
```ts
import type { Db } from '@cs/db';
import { sql } from 'drizzle-orm';

/** Claims due pages exactly once across concurrent schedulers by advancing next_due_at in one statement. */
export async function claimDuePages(db: Db, limit: number): Promise<string[]> {
  const rows = (await db.execute(sql`
    UPDATE tracked_page
       SET next_due_at = now() + CASE cadence WHEN 'daily' THEN interval '1 day' ELSE interval '7 days' END
     WHERE id IN (
       SELECT id FROM tracked_page
        WHERE active AND next_due_at <= now()
        ORDER BY next_due_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
    RETURNING id`)) as unknown as { id: string }[];
  return rows.map((r) => r.id);
}
```

`packages/collectors/src/capture/capture-page.ts`:
```ts
import type { CaptureStatus } from '@cs/core';
import { type Db, trackedPage } from '@cs/db';
import type { ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { recordWebCapture } from '../evidence/recorder';
import type { Renderer } from '../web/renderer';

export async function capturePage(
  deps: { db: Db; store: ObjectStore; renderer: Renderer },
  trackedPageId: string,
): Promise<{ status: CaptureStatus | 'missing' }> {
  const [tp] = await deps.db.select().from(trackedPage).where(eq(trackedPage.id, trackedPageId)).limit(1);
  if (!tp || !tp.active) return { status: 'missing' };
  const page = await deps.renderer.render(tp.url);
  try {
    const r = await recordWebCapture({ db: deps.db, store: deps.store }, { trackedPage: { id: tp.id, competitorId: tp.competitorId, url: tp.url }, page });
    return { status: r.status };
  } finally {
    await page.close();
  }
}
```

`packages/collectors/src/index.ts` — add:
```ts
export * from './capture/capture-page';
export * from './schedule/due-pages';
```

- [ ] **Step 4: Implement worker deps and jobs**

`apps/worker/package.json` — add dependencies: `"@cs/ai": "workspace:*"`, `"@cs/collectors": "workspace:*"`, `"@cs/db": "workspace:*"`, `"@cs/storage": "workspace:*"`, `"drizzle-orm": "^0.44.5"`; run `pnpm install`.

`apps/worker/src/deps.ts`:
```ts
import { type Ai, createAiFromEnv, DEFAULT_AI_CONFIG_PATH, loadAiConfigFile } from '@cs/ai';
import {
  capturePage, claimDuePages, createPlaywrightRenderer, createPoliteRenderer, defaultFetchText, discoverPages, HostRateLimiter,
  type Renderer, RobotsPolicy,
} from '@cs/collectors';
import type { CaptureStatus } from '@cs/core';
import { competitor, createDb, createLedgerSink, type Db } from '@cs/db';
import { createStoreFromEnv, type ObjectStore } from '@cs/storage';
import { eq } from 'drizzle-orm';

export interface WorkerDeps {
  claimDuePages(limit: number): Promise<string[]>;
  capturePage(trackedPageId: string): Promise<{ status: CaptureStatus | 'missing' }>;
  discoverPages(competitorId: string): Promise<{ selected: number; candidates: number; homepageStatus: string } | { skipped: string }>;
  close(): Promise<void>;
}

/** Everything is created lazily so importing this module has no side effects. */
export function createWorkerDeps(env: NodeJS.ProcessEnv): WorkerDeps {
  let db: { db: Db; close(): Promise<void> } | null = null;
  let store: ObjectStore | null = null;
  let renderer: Renderer | null = null;
  let ai: Promise<Ai> | null = null;
  const robots = new RobotsPolicy(defaultFetchText);
  const limiter = new HostRateLimiter();

  const getDb = () => {
    if (!db) {
      const url = env.SERVICE_DATABASE_URL;
      if (!url) throw new Error('SERVICE_DATABASE_URL is required');
      db = createDb(url);
    }
    return db.db;
  };
  const getStore = () => (store ??= createStoreFromEnv(env));
  const getRenderer = () => (renderer ??= createPoliteRenderer({ robots, limiter, renderer: createPlaywrightRenderer() }));
  const getAi = () => (ai ??= loadAiConfigFile(DEFAULT_AI_CONFIG_PATH).then((cfg) => createAiFromEnv(env, cfg, createLedgerSink(getDb()))));

  return {
    claimDuePages: (limit) => claimDuePages(getDb(), limit),
    capturePage: (id) => capturePage({ db: getDb(), store: getStore(), renderer: getRenderer() }, id),
    async discoverPages(competitorId) {
      const [c] = await getDb().select().from(competitor).where(eq(competitor.id, competitorId)).limit(1);
      if (!c?.domain) return { skipped: 'competitor has no domain' };
      return discoverPages({ db: getDb(), renderer: getRenderer(), robots, fetchText: defaultFetchText, ai: await getAi() }, { id: c.id, domain: c.domain });
    },
    async close() {
      await renderer?.close();
      await db?.close();
    },
  };
}
```

`apps/worker/src/jobs/web.ts`:
```ts
import { z } from 'zod';
import type { WorkerDeps } from '../deps';
import { defineJob } from '../jobs';

export const WEB_SCHEDULE_BATCH = 200;

export function createWebJobs(deps: WorkerDeps, queue: { enqueueCapture(trackedPageId: string): Promise<void> }) {
  const schedule = defineJob({
    name: 'web-schedule',
    schema: z.looseObject({}),
    cron: '*/15 * * * *',
    handler: async () => {
      const ids = await deps.claimDuePages(WEB_SCHEDULE_BATCH);
      for (const id of ids) await queue.enqueueCapture(id);
      if (ids.length > 0) console.log(`[web-schedule] enqueued ${ids.length} page captures`);
    },
  });
  const capture = defineJob({
    name: 'web-capture-page',
    schema: z.object({ trackedPageId: z.uuid() }),
    handler: async ({ trackedPageId }) => {
      const r = await deps.capturePage(trackedPageId);
      console.log(`[web-capture-page] ${trackedPageId} → ${r.status}`);
    },
  });
  const discover = defineJob({
    name: 'discover-pages',
    schema: z.object({ competitorId: z.uuid() }),
    handler: async ({ competitorId }) => {
      const r = await deps.discoverPages(competitorId);
      console.log(`[discover-pages] ${competitorId} → ${JSON.stringify(r)}`);
    },
  });
  return { schedule, capture, discover };
}
```

`apps/worker/src/main.ts` — after `await boss.start();` replace the registration with:
```ts
import { enqueue } from './boss';
import { createWorkerDeps } from './deps';
import { createWebJobs } from './jobs/web';
```
(imports at the top, next to the existing ones) and:
```ts
const deps = createWorkerDeps(process.env);
const web = createWebJobs(deps, {
  enqueueCapture: async (trackedPageId) => {
    await enqueue(boss, web.capture, { trackedPageId });
  },
});
await registerJobs(boss, [heartbeatJob, web.schedule, web.capture, web.discover]);
console.log('[worker] started');
```
and in the signal handler, before `boss.stop`, add `await deps.close();`.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @cs/collectors test && pnpm --filter @cs/collectors typecheck && pnpm --filter @cs/worker test && pnpm --filter @cs/worker typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/collectors apps/worker pnpm-lock.yaml
git commit -m "feat(worker): scheduled web capture and page discovery jobs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `collect-once` CLI, CI browser install, env and docs

**Files:**
- Create: `apps/worker/src/cli/collect-once.ts`; Modify: `apps/worker/package.json`
- Modify: `.github/workflows/ci.yml`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: `createWorkerDeps` (Task 8), `competitor` table
- Produces: `pnpm --filter @cs/worker collect-once --domain <domain> [--name <name>]` — upserts the competitor (service role), runs discovery, captures every tracked page once, prints a summary table (url, type, status)

- [ ] **Step 1: Implement the CLI**

`apps/worker/package.json` scripts — add `"collect-once": "tsx src/cli/collect-once.ts"`.

`apps/worker/src/cli/collect-once.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../../.env', import.meta.url)));
} catch {
  // optional
}

const { competitor, createDb, trackedPage } = await import('@cs/db');
const { eq } = await import('drizzle-orm');
const { createWorkerDeps } = await import('../deps');

const { values } = parseArgs({ options: { domain: { type: 'string' }, name: { type: 'string' } } });
const domain = values.domain?.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
if (!domain) {
  console.error('Usage: pnpm --filter @cs/worker collect-once --domain example.com [--name "Example Co"]');
  process.exit(1);
}
const url = process.env.SERVICE_DATABASE_URL;
if (!url) {
  console.error('SERVICE_DATABASE_URL is required');
  process.exit(1);
}

const { db, close } = createDb(url);
const deps = createWorkerDeps(process.env);
try {
  const [row] = await db
    .insert(competitor)
    .values({ name: values.name ?? domain, domain })
    .onConflictDoUpdate({ target: competitor.domain, set: { domain } })
    .returning();
  if (!row) throw new Error('competitor upsert failed');
  console.log(`competitor ${row.id} (${domain}) — discovering pages…`);
  console.log(JSON.stringify(await deps.discoverPages(row.id)));

  const pages = await db.select().from(trackedPage).where(eq(trackedPage.competitorId, row.id));
  const results: { url: string; type: string; status: string }[] = [];
  for (const p of pages) results.push({ url: p.url, type: p.pageType, status: (await deps.capturePage(p.id)).status });
  console.table(results);
} finally {
  await deps.close();
  await close();
}
```

- [ ] **Step 2: Manual acceptance run**

Ensure `.env` has `EVIDENCE_FS_DIR=./.evidence` (or R2 variables) and `SERVICE_DATABASE_URL`. Add `.evidence/` to `.gitignore`.
Run: `pnpm --filter @cs/worker collect-once --domain example.com --name "Example"`
Expected: discovery reports `homepageStatus: ok` and at least the homepage is selected; the table shows `ok` for the first capture. Run it a second time: the same pages show `unchanged`. Paste both outputs in the report. (example.com is IANA-run and safe to fetch; do not point this at real competitors until the bot information page at rivalmonday.com/bot exists — see handover.)

- [ ] **Step 3: CI, env example, README**

`.github/workflows/ci.yml` — after `pnpm install --frozen-lockfile` add:
```yaml
      - name: Install Playwright chromium
        run: pnpm --filter @cs/collectors exec playwright install --with-deps chromium
```
`.env.example` — append:
```
# Evidence storage: R2 in production, local folder in development
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
EVIDENCE_FS_DIR=./.evidence
```
`README.md` — add `@cs/storage` and `@cs/collectors` to the packages table; add a "Collection (Phase 2a)" section covering: `pnpm --filter @cs/collectors browsers` (one-time chromium download), the evidence-store env vars, the worker jobs (`web-schedule` every 15 min, `web-capture-page`, `discover-pages`), the `collect-once` command, and the crawler conduct rules from Global Constraints.

- [ ] **Step 4: Full verification**

Run: `pnpm typecheck && pnpm test`
Expected: all packages pass (the Jev live test now runs with the key in `.env`).

- [ ] **Step 5: Commit**

```bash
git add apps/worker .github .env.example README.md .gitignore
git commit -m "feat(worker): collect-once CLI; CI installs chromium; docs for collection

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2a exit criteria

- `pnpm typecheck && pnpm test` green locally (Neon) and in CI.
- `collect-once --domain example.com` produces `ok` then `unchanged` captures with evidence in the configured store.
- RLS: client-scoped users only see evidence of competitors their client tracks; app_user cannot write any global/system table (guard test).
- Worker starts with the three web jobs registered.

Next: Phase 2b plan (vendor data sources) — see [2026-09-30-phase-2b-vendor-sources.md](2026-09-30-phase-2b-vendor-sources.md).
