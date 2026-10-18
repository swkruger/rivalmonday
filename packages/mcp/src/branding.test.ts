import { agency } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { dbs, resetWorkspace } from '@cs/tools/test-fixtures';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PRODUCT_NAME, displayNameFor, NEUTRAL_PRODUCT_NAME, productNameFor } from './branding';

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

describe('displayNameFor (15a §2.10 fix round 1: the Ask disclosure names only the white-label service)', () => {
  it('is the trimmed branding displayName', async () => {
    await set({ name: 'Acme Marketing LLC', branding: { displayName: ' Cool Comfort ' } });
    expect(await displayNameFor(dbs.service, IDS.agencyA)).toBe('Cool Comfort');
  });

  it('is null without a displayName (blank included) or for an unknown agency — never the agency name or Rival Monday', async () => {
    await set({ name: 'Acme Marketing', branding: null });
    expect(await displayNameFor(dbs.service, IDS.agencyA)).toBeNull();
    await set({ branding: { displayName: '   ' } });
    expect(await displayNameFor(dbs.service, IDS.agencyA)).toBeNull();
    expect(await displayNameFor(dbs.service, '00000000-0000-4000-8000-00000000dead')).toBeNull();
  });

  it("the neutral consent fallback stays \"your agency's assistant\"", () => {
    expect(NEUTRAL_PRODUCT_NAME).toBe("your agency's assistant");
  });
});
