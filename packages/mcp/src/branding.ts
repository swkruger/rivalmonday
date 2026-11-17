import { agency, type Db } from '@cs/db';
import { eq } from 'drizzle-orm';

/** 15a §2.10 / D12: the OAuth consent title's fallback when the page can't tell the agency — never the product name. */
export const NEUTRAL_PRODUCT_NAME = "your agency's assistant";

const trimmed = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** The agency's trimmed `branding.displayName` (the white-label service name), else null. */
export async function displayNameFor(service: Db, agencyId: string): Promise<string | null> {
  const [row] = await service.select({ branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  return trimmed(row?.branding?.displayName);
}

/** Q9 / P15: the white-label product name = the agency's trimmed `branding.displayName`, else its trimmed name, else `NEUTRAL_PRODUCT_NAME` — never Rival Monday. MCP descriptions swap `Rival Monday` for it. */
export async function productNameFor(service: Db, agencyId: string): Promise<string> {
  const [row] = await service.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  return trimmed(row?.branding?.displayName) ?? trimmed(row?.name) ?? NEUTRAL_PRODUCT_NAME;
}
