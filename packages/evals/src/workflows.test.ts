import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = resolve(import.meta.dirname, '../../..');
const load = (f: string) => parse(readFileSync(resolve(root, '.github/workflows', f), 'utf8')) as any;
const live = () => load('evals-live.yml');
const steps = (job: any): any[] => job.steps ?? [];

describe('evals-live workflow', () => {
  it('top-level permissions are exactly contents: read and no job widens them', () => {
    const w = live();
    expect(w.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values<any>(w.jobs)) expect(job.permissions).toBeUndefined();
  });

  it('has no pull_request_target trigger', () => {
    const on = live().on;
    expect(Object.keys(on)).not.toContain('pull_request_target');
    expect(Object.keys(on).sort()).toEqual(['pull_request', 'schedule', 'workflow_dispatch']);
  });

  it('live job uses environment evals and passes --max-usd', () => {
    const job = live().jobs['evals-live'];
    expect(job.environment).toBe('evals');
    expect(steps(job).some((s) => String(s.run ?? '').includes('--max-usd'))).toBe(true);
  });

  it('checkout steps set persist-credentials false', () => {
    for (const job of Object.values<any>(live().jobs)) {
      const co = steps(job).filter((s) => String(s.uses ?? '').startsWith('actions/checkout'));
      expect(co.length).toBeGreaterThan(0);
      for (const s of co) expect(s.with?.['persist-credentials']).toBe(false);
    }
  });

  it('no step runs git push or git commit', () => {
    for (const job of Object.values<any>(live().jobs))
      for (const s of steps(job)) expect(String(s.run ?? '')).not.toMatch(/git\s+(push|commit)/);
  });

  it('failure email runs only on schedule failure', () => {
    const s = steps(live().jobs['evals-live']).find((x) => /postmark/i.test(String(x.run ?? '')));
    expect(s).toBeDefined();
    expect(s.if).toContain('failure()');
    expect(s.if).toContain("github.event_name == 'schedule'");
  });

  it('changes paths equal the spec list', () => {
    const run = steps(live().jobs.changes).find((s) => s.id === 'diff').run as string;
    const m = run.match(/grep -qE '\^\((.+?)\)'/);
    expect(m).not.toBeNull();
    const got = m![1].split('|').map((p) => p.replace(/\\./g, '.'));
    expect(got.sort()).toEqual(
      [
        'packages/ai/config/ai.yaml',
        'packages/ai/src/',
        'packages/engine/src/briefs/',
        'packages/ask/src/',
        'packages/evals/',
      ].sort(),
    );
  });

  it('ci.yml test job runs pnpm eval:replay after pnpm test', () => {
    const runs = steps(load('ci.yml').jobs.test).map((s) => String(s.run ?? ''));
    const t = runs.indexOf('pnpm test');
    const r = runs.indexOf('pnpm eval:replay');
    expect(t).toBeGreaterThanOrEqual(0);
    expect(r).toBeGreaterThan(t);
  });
});
