import { type AgencyInviteLinkRow, type Db, discountCode } from '@cs/db';
import { eq } from 'drizzle-orm';

const dateText = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export async function discountText(service: Db, link: Pick<AgencyInviteLinkRow, 'discountCodeId'>): Promise<string | null> {
  if (!link.discountCodeId) return null;
  const [d] = await service.select({ percentOff: discountCode.percentOff, amountOffCents: discountCode.amountOffCents }).from(discountCode).where(eq(discountCode.id, link.discountCodeId));
  if (d?.percentOff) return `${Number(d.percentOff)}% off`;
  if (d?.amountOffCents) return `$${(d.amountOffCents / 100).toFixed(2).replace(/\.00$/, '')} off`;
  return null;
}

/** Offer banner copy (decided). */
export function offerBanner(link: Pick<AgencyInviteLinkRow, 'offer' | 'pilotEndsAt'>, discount: string | null): string {
  if (link.offer === 'pilot') return `You're invited to the Rival Monday pilot${link.pilotEndsAt ? ` until ${dateText(link.pilotEndsAt)}` : ''}.`;
  return `You're invited to a 30-day Rival Monday trial${discount ? ` with ${discount}` : ''}.`;
}
