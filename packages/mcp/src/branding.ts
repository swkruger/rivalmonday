import { agency, type Db } from '@cs/db';
import { eq } from 'drizzle-orm';

export const DEFAULT_PRODUCT_NAME = 'Rival Monday';

/** P15: the white-label product name = the agency's trimmed `branding.displayName`, else 'Rival Monday'. */
export async function productNameFor(service: Db, agencyId: string): Promise<string> {
  const [row] = await service.select({ branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  const name = row?.branding?.displayName;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : DEFAULT_PRODUCT_NAME;
}
