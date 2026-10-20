import type { Db } from '@cs/db';
import { describe, expect, it } from 'vitest';
import { kbNamesFor } from './names';

/** Minimal stand-in for the drizzle select chain: select().from().where() resolves to the rows. */
const dbWith = (branding: unknown): Db =>
  ({ select: () => ({ from: () => ({ where: async () => (branding === undefined ? [] : [{ branding }]) }) }) }) as unknown as Db;

describe('kbNamesFor', () => {
  it('agency-facing default keeps the Rival Monday / Friday fallbacks', async () => {
    expect(await kbNamesFor(dbWith({}), 'a')).toEqual({ productName: 'Rival Monday', assistantName: 'Friday' });
    expect(await kbNamesFor(dbWith(undefined), 'a', { clientFacing: false })).toEqual({ productName: 'Rival Monday', assistantName: 'Friday' });
  });
  it('uses the trimmed agency display and assistant names in both modes', async () => {
    const b = { displayName: ' Acme Spy ', assistantName: ' Penny ' };
    expect(await kbNamesFor(dbWith(b), 'a')).toEqual({ productName: 'Acme Spy', assistantName: 'Penny' });
    expect(await kbNamesFor(dbWith(b), 'a', { clientFacing: true })).toEqual({ productName: 'Acme Spy', assistantName: 'Penny' });
  });
  it('client-facing with no display name never says Rival Monday', async () => {
    for (const branding of [undefined, null, {}, { displayName: '   ' }]) {
      const n = await kbNamesFor(dbWith(branding), 'a', { clientFacing: true });
      expect(n.productName).toBe('your agency');
      expect(n.productName).not.toMatch(/rival monday/i);
    }
  });
});
