import { describe, expect, it } from 'vitest';
import { assertTestDbUrls } from './test-db';

const ok = 'postgres://u:p@localhost:5432/cs_test';
const bad = 'postgres://u:p@localhost:5432/cs_dev';

describe('assertTestDbUrls', () => {
  it('accepts three _test URLs', () => {
    expect(() => assertTestDbUrls({ owner: ok, app: ok, service: ok })).not.toThrow();
  });
  it('refuses a database not ending _test', () => {
    expect(() => assertTestDbUrls({ owner: bad, app: ok, service: ok })).toThrow(/Refusing to use database "cs_dev" \(owner URL\)/);
    expect(() => assertTestDbUrls({ owner: ok, app: 'postgres://u:p@h/cs_test_backup', service: ok })).toThrow(/\(app URL\)/);
  });
  it('refuses a bad app or service URL even when owner is fine', () => {
    expect(() => assertTestDbUrls({ owner: ok, app: bad, service: ok })).toThrow(/\(app URL\)/);
    expect(() => assertTestDbUrls({ owner: ok, app: ok, service: bad })).toThrow(/\(service URL\)/);
  });
});
