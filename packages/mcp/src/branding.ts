import { agency, type Db } from '@cs/db';
import { eq } from 'drizzle-orm';

export const DEFAULT_PRODUCT_NAME = 'Rival Monday';

/** 15a §2.10 / D12: what client-facing text says when the agency has no name to show — never the product name. */
export const NEUTRAL_PRODUCT_NAME = "your agency's assistant";

const trimmed = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** P15: the white-label product name = the agency's trimmed `branding.displayName`, else 'Rival Monday'. Agency-facing / MCP. */
export async function productNameFor(service: Db, agencyId: string): Promise<string> {
  const [row] = await service.select({ branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  return trimmed(row?.branding?.displayName) ?? DEFAULT_PRODUCT_NAME;
}

/**
 * 15a §2.10: the name client-facing text (Ask disclosure, OAuth consent) uses — `branding.displayName`, else the agency's
 * own name (as `resolveBranding` does for the shell), else {@link NEUTRAL_PRODUCT_NAME}. Never "Rival Monday".
 */
export async function clientProductNameFor(service: Db, agencyId: string): Promise<string> {
  const [row] = await service.select({ name: agency.name, branding: agency.branding }).from(agency).where(eq(agency.id, agencyId));
  return trimmed(row?.branding?.displayName) ?? trimmed(row?.name) ?? NEUTRAL_PRODUCT_NAME;
}
