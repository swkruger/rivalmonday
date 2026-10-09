import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeEnvName, isLocalHost, processGuardOn, requestGuardOn, writeDevEnv } from './dev-guard';

const ON = { NODE_ENV: 'development', DEV_PANEL: '1' } as unknown as NodeJS.ProcessEnv;

describe('the three guard conditions (spec §5.3)', () => {
  it('is on only when all three hold', () => {
    expect(requestGuardOn('localhost:3000', ON)).toBe(true);
    expect(requestGuardOn('127.0.0.1:3100', ON)).toBe(true);
    expect(requestGuardOn('LOCALHOST', ON)).toBe(true);
  });

  it('is off when NODE_ENV is production', () => {
    expect(processGuardOn({ ...ON, NODE_ENV: 'production' })).toBe(false);
    expect(requestGuardOn('localhost:3000', { ...ON, NODE_ENV: 'production' })).toBe(false);
  });

  it('is off unless DEV_PANEL is exactly "1"', () => {
    for (const v of [undefined, '', '0', 'true', ' 1']) expect(requestGuardOn('localhost:3000', { ...ON, DEV_PANEL: v })).toBe(false);
  });

  it('is off for any host but localhost or 127.0.0.1 (Review Focus 2)', () => {
    for (const h of ['192.168.1.20:3000', 'localhost.evil.example', 'evil.example', '[::1]:3000', '0.0.0.0:3000', '', null, undefined]) {
      expect(isLocalHost(h)).toBe(false);
      expect(requestGuardOn(h ?? null, ON)).toBe(false);
    }
  });
});

describe('activeEnvName', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dev-env-'));
    file = join(dir, 'dev-env.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('defaults to DEV and follows the file while the guard is on', async () => {
    const env = { ...ON, RM_DEV_ENV_FILE: file } as unknown as NodeJS.ProcessEnv;
    expect(activeEnvName(env)).toBe('dev');
    await writeDevEnv(file, 'demo');
    expect(activeEnvName(env)).toBe('demo');
    await writeDevEnv(file, 'test');
    expect(activeEnvName(env)).toBe('test');
  });

  it('ignores the file when the guard is off', async () => {
    await writeDevEnv(file, 'demo');
    expect(activeEnvName({ ...ON, DEV_PANEL: undefined, RM_DEV_ENV_FILE: file } as unknown as NodeJS.ProcessEnv)).toBe('dev');
    expect(activeEnvName({ ...ON, NODE_ENV: 'production', RM_DEV_ENV_FILE: file } as unknown as NodeJS.ProcessEnv)).toBe('dev');
  });

  it('falls back to DEV for an unknown or broken file', () => {
    const env = { ...ON, RM_DEV_ENV_FILE: file } as unknown as NodeJS.ProcessEnv;
    writeFileSync(file, '{"env":"prod"}', 'utf8');
    expect(activeEnvName(env)).toBe('dev');
    writeFileSync(file, 'not json', 'utf8');
    expect(activeEnvName(env)).toBe('dev');
  });
});
