import { agency, type Db } from '@cs/db';
import { eq } from 'drizzle-orm';

export const DEFAULT_PRODUCT_NAME = 'Rival Monday';

/** 15a §2.10 / D12: the OAuth consent title's fallback when the page can't tell the agency — never the product name. */
export const NEUTRAL_PRODUCT_NAME = "your agency's assistant";

const trimmed = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** The agency's trimmed `branding.displayName` (the white-label service name), else null. */
export async function displayNameFor(service: Db, agencyId: string): Promise<string | null> {
  const [row] = await service.select({ branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  return trimmed(row?.branding?.displayName);
}

/** P15: the white-label product name = the agency's trimmed `branding.displayName`, else 'Rival Monday'. Agency-facing / MCP. */
export async function productNameFor(service: Db, agencyId: string): Promise<string> {
  return (await displayNameFor(service, agencyId)) ?? DEFAULT_PRODUCT_NAME;
}
