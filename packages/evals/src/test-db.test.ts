import { describe, expect, it } from 'vitest';
import { prepareTestDb } from './test-db';

describe('prepareTestDb', () => {
  it('refuses a database not ending _test', async () => {
    await expect(prepareTestDb('postgres://postgres:postgres@localhost:5432/cs_dev')).rejects.toThrow(/must end _test|ends _test/);
    await expect(prepareTestDb('postgres://postgres:postgres@localhost:5432/cs_test_backup')).rejects.toThrow(/Refusing/);
  });
});
