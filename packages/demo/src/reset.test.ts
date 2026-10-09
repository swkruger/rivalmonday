import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearDemoEvidence, runDemoReset } from './reset';

const ENV = {
  DATABASE_URL: 'postgresql://owner:pw@h.example/cs_dev',
  APP_DATABASE_URL: 'postgresql://app_user:pw@h.example/cs_dev',
  SERVICE_DATABASE_URL: 'postgresql://app_service:pw@h.example/cs_dev',
  REVIEWER_HASH_SALT: 's'.repeat(40),
  LINK_SIGNING_SECRET: 'l'.repeat(40),
} as unknown as NodeJS.ProcessEnv;

describe('runDemoReset (Review Focus 1)', () => {
  it('refuses before connecting when DATABASE_URL does not name cs_dev', async () => {
    await expect(runDemoReset({ repoRoot: '/repo', env: { ...ENV, DATABASE_URL: 'postgresql://owner:pw@h.example/cs_live' } })).rejects.toThrow(/DATABASE_URL must name cs_dev/);
  });

  it('refuses without a reviewer salt or a link secret', async () => {
    await expect(runDemoReset({ repoRoot: '/repo', env: { ...ENV, REVIEWER_HASH_SALT: '' } })).rejects.toThrow(/REVIEWER_HASH_SALT/);
    await expect(runDemoReset({ repoRoot: '/repo', env: { ...ENV, LINK_SIGNING_SECRET: 'short' } })).rejects.toThrow(/LINK_SIGNING_SECRET/);
  });
});

describe('clearDemoEvidence', () => {
  it('only ever empties a directory named .evidence-demo', async () => {
    const root = mkdtempSync(join(tmpdir(), 'demo-ev-'));
    try {
      await expect(clearDemoEvidence(join(root, '.evidence'))).rejects.toThrow(/\.evidence-demo/);
      await expect(clearDemoEvidence(join(root, '.evidence-demo'))).resolves.toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
