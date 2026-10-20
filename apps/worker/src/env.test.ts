import { describe, expect, it } from 'vitest';
import { REQUIRED_PROD_ENV, missingProdEnv } from './env';

describe('missingProdEnv', () => {
  it('is empty outside production', () => {
    expect(missingProdEnv({ NODE_ENV: 'development' })).toEqual([]);
    expect(missingProdEnv({})).toEqual([]);
  });
  it('lists missing and blank vars in production', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production' };
    for (const k of REQUIRED_PROD_ENV) env[k] = 'x';
    expect(missingProdEnv(env)).toEqual([]);
    delete env.SENTRY_DSN;
    env.APP_URL = '   ';
    expect(missingProdEnv(env)).toEqual(['APP_URL', 'SENTRY_DSN']);
  });
  it('has the Decision 4 list', () => {
    expect(REQUIRED_PROD_ENV).toHaveLength(13);
  });
});
