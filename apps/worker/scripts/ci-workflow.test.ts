import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Shape of .github/workflows/ci.yml that the deploy runbook (docs/DEPLOY.md) relies on (Phase 7a1, spec §3).
interface Step { name?: string; run?: string; uses?: string; env?: Record<string, string>; 'continue-on-error'?: unknown }
interface Job {
  needs?: string | string[];
  if?: string;
  environment?: string | { name: string };
  concurrency?: { group: string; 'cancel-in-progress': boolean };
  services?: Record<string, { image: string }>;
  steps: Step[];
  'continue-on-error'?: unknown;
}

const raw = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const wf = parse(raw) as { jobs: Record<string, Job> };
const deploy = wf.jobs.deploy!;
const stepIndex = (job: Job, re: RegExp) => job.steps.findIndex((s) => re.test(s.run ?? ''));
const step = (job: Job, re: RegExp) => job.steps[stepIndex(job, re)];
const MIGRATION_URL = '${{ secrets.MIGRATION_DATABASE_URL }}';

describe('ci workflow shape', () => {
  it('deploy needs the test and image jobs', () => {
    const needs = [deploy.needs ?? []].flat();
    expect(needs).toEqual(expect.arrayContaining(['test', 'image']));
  });

  it('deploy runs only on a push to main, in the production environment', () => {
    expect(deploy.if).toContain("vars.DEPLOY_ENABLED == 'true'");
    expect(deploy.if).toContain("github.ref == 'refs/heads/main'");
    expect(deploy.if).toContain("github.event_name == 'push'");
    const env = deploy.environment;
    expect(typeof env === 'string' ? env : env?.name).toBe('production');
  });

  it('deploys are serialised and never cancelled', () => {
    expect(deploy.concurrency).toEqual({ group: 'production', 'cancel-in-progress': false });
  });

  it('runs predeploy-check -> migrate -> Vercel -> Railway -> Sentry release, in that order', () => {
    const order = [
      /pnpm --filter @cs\/db predeploy-check/,
      /pnpm --filter @cs\/db migrate/,
      /vercel@\S+ deploy --prebuilt --prod/,
      /@railway\/cli@\S+ up --ci --service rivalmonday-worker/,
      /@sentry\/cli@\S+ releases finalize/,
    ].map((re) => stepIndex(deploy, re));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('pre-check and migrate use the owner URL from MIGRATION_DATABASE_URL', () => {
    expect(step(deploy, /predeploy-check/)?.env?.DATABASE_URL).toBe(MIGRATION_URL);
    expect(step(deploy, /@cs\/db migrate/)?.env?.DATABASE_URL).toBe(MIGRATION_URL);
    // The owner URL never reaches any other step.
    const others = deploy.steps.filter((s) => !/predeploy-check|@cs\/db migrate/.test(s.run ?? ''));
    expect(JSON.stringify(others)).not.toContain('MIGRATION_DATABASE_URL');
  });

  it('pins the deploy CLIs to exact versions', () => {
    const runs = deploy.steps.map((s) => s.run ?? '').join('\n');
    for (const cli of ['vercel', '@railway/cli', '@sentry/cli']) {
      expect(runs).toMatch(new RegExp(`${cli.replace('/', '\\/')}@\\d+\\.\\d+\\.\\d+(\\s|$)`));
    }
  });

  it('writes the worker release file before railway up', () => {
    const release = stepIndex(deploy, /\$GITHUB_SHA.*> apps\/worker\/\.release/);
    expect(release).toBeGreaterThanOrEqual(0);
    expect(release).toBeLessThanOrEqual(stepIndex(deploy, /@railway\/cli@\S+ up /));
  });

  it('has no continue-on-error anywhere', () => {
    expect(raw).not.toContain('continue-on-error');
  });

  it('builds the worker image and runs the image smoke test', () => {
    const image = wf.jobs.image!;
    expect(step(image, /docker build .*-f apps\/worker\/Dockerfile/)).toBeDefined();
    expect(step(image, /docker run .*smoke:image/)).toBeDefined();
  });

  it('tests on Postgres 18 + pgvector, with runtime roles and a schema drift check', () => {
    const test = wf.jobs.test!;
    expect(test.services?.postgres?.image).toMatch(/pg18$/);
    expect(step(test, /infra\/db\/init\/01-roles\.sql/)).toBeDefined();
    expect(step(test, /pnpm --filter @cs\/db exec drizzle-kit check/)).toBeDefined();
  });
});
