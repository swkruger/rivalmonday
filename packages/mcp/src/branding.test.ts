import { agency } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { dbs, resetWorkspace } from '@cs/tools/test-fixtures';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { clientProductNameFor, DEFAULT_PRODUCT_NAME, NEUTRAL_PRODUCT_NAME, productNameFor } from './branding';

const set = (values: { name?: string; branding?: Record<string, unknown> | null }) => dbs.service.update(agency).set(values).where(eq(agency.id, IDS.agencyA));

beforeEach(async () => {
  await resetWorkspace();
});

describe('productNameFor (agency-facing, unchanged)', () => {
  it('is the trimmed branding displayName, else Rival Monday', async () => {
    await set({ branding: { displayName: '  Cool Comfort  ' } });
    expect(await productNameFor(dbs.service, IDS.agencyA)).toBe('Cool Comfort');
    await set({ branding: null });
    expect(await productNameFor(dbs.service, IDS.agencyA)).toBe(DEFAULT_PRODUCT_NAME);
  });
});

describe('clientProductNameFor (15a §2.10: client-facing, never Rival Monday)', () => {
  it('prefers the trimmed branding displayName', async () => {
    await set({ name: 'Acme Marketing LLC', branding: { displayName: ' Cool Comfort ' } });
    expect(await clientProductNameFor(dbs.service, IDS.agencyA)).toBe('Cool Comfort');
  });

  it('falls back to the agency name when no displayName is set (or it is blank)', async () => {
    await set({ name: ' Acme Marketing ', branding: null });
    expect(await clientProductNameFor(dbs.service, IDS.agencyA)).toBe('Acme Marketing');
    await set({ branding: { displayName: '   ' } });
    expect(await clientProductNameFor(dbs.service, IDS.agencyA)).toBe('Acme Marketing');
  });

  it("uses the neutral \"your agency's assistant\" when the agency has no name to show, or is unknown", async () => {
    await set({ name: '  ', branding: null });
    expect(await clientProductNameFor(dbs.service, IDS.agencyA)).toBe(NEUTRAL_PRODUCT_NAME);
    expect(NEUTRAL_PRODUCT_NAME).toBe("your agency's assistant");
    expect(await clientProductNameFor(dbs.service, '00000000-0000-4000-8000-00000000dead')).toBe(NEUTRAL_PRODUCT_NAME);
  });
});
