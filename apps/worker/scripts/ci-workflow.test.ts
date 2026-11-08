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

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
const raw = read('.github/workflows/ci.yml');
const wf = parse(raw) as { jobs: Record<string, Job> };
const deploy = wf.jobs.deploy!;
const deployStaging = wf.jobs['deploy-staging']!;
const refreshRaw = read('.github/workflows/staging-refresh.yml');
const refresh = (parse(refreshRaw) as { jobs: Record<string, Job> }).jobs.refresh!;
const workerScript = read('scripts/railway-deploy-worker.sh');
const WORKER_DEPLOY = /bash scripts\/railway-deploy-worker\.sh rivalmonday-worker/;
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
      WORKER_DEPLOY,
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
    const runs = [...deploy.steps.map((s) => s.run ?? ''), workerScript].join('\n');
    for (const cli of ['vercel', '@railway/cli', '@sentry/cli']) {
      expect(runs).toMatch(new RegExp(`${cli.replace('/', '\\/')}@\\d+\\.\\d+\\.\\d+(\\s|$)`));
    }
  });

  it('the worker deploy sets SENTRY_RELEASE as a variable before railway up (up skips the git-ignored .release)', () => {
    const release = workerScript.indexOf('variable set "SENTRY_RELEASE=$sha"');
    expect(release).toBeGreaterThanOrEqual(0);
    expect(release).toBeLessThan(workerScript.indexOf('railway up --ci --service'));
    expect(workerScript).toContain('--skip-deploys');
    expect(raw).not.toContain('apps/worker/.release');
  });

  it('the worker deploy waits for the uploaded deployment to reach SUCCESS', () => {
    expect(workerScript).toMatch(/deployment list --service/);
    expect(workerScript).toMatch(/SUCCESS\)/);
    expect(workerScript).toMatch(/FAILED\|CRASHED/);
  });

  it('deploy-staging deploys the Railway staging worker after migrate and the app smoke test', () => {
    const migrate = stepIndex(deployStaging, /@cs\/db migrate/);
    const smoke = stepIndex(deployStaging, /\/sign-in/);
    const worker = stepIndex(deployStaging, WORKER_DEPLOY);
    expect(migrate).toBeGreaterThanOrEqual(0);
    expect(smoke).toBeGreaterThan(migrate);
    expect(worker).toBeGreaterThan(smoke);
    expect(deployStaging.steps[worker]?.env?.RAILWAY_TOKEN).toBe('${{ secrets.RAILWAY_TOKEN }}');
    expect(deployStaging.environment).toBe('staging');
  });

  it('staging-refresh stops the worker before the reset and redeploys it after migrating', () => {
    const stop = stepIndex(refresh, /railway\/cli@\S+ down --service rivalmonday-worker -y/);
    const connected = stepIndex(refresh, /usename = 'cs_worker'/);
    const reset = stepIndex(refresh, /\/restore/);
    const migrate = stepIndex(refresh, /@cs\/db migrate/);
    const redeploy = stepIndex(refresh, WORKER_DEPLOY);
    expect(stop).toBeGreaterThanOrEqual(0);
    expect(connected).toBe(stop);
    expect(reset).toBeGreaterThan(stop);
    expect(redeploy).toBeGreaterThan(migrate);
    expect(refresh.environment).toBe('staging');
    expect(refreshRaw).not.toContain('continue-on-error');
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
