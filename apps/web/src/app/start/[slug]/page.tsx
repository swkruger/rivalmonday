import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { agencyIntake, NOINDEX, turnstileSiteKey } from '../brand';
import { IntakeLanding } from '../landing';
import { refParam, SLUG_RE } from '../params';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const brandFor = async (slug: string) => (SLUG_RE.test(slug) ? agencyIntake(slug) : null);

/** The tab title names the agency, never Rival Monday (the root layout's default title is overridden here). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await brandFor((await params).slug);
  return { title: brand?.displayName ? `Get your free competitor snapshot · ${brand.displayName}` : 'Not found', robots: NOINDEX };
}

/** Phase 11c §3: an agency's intake page, agency-branded. Unknown, disabled or non-serviceable → 404. Public. */
export default async function AgencyIntakePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const brand = await brandFor(slug);
  if (!brand) notFound();
  const refCode = refParam((await searchParams).ref);
  return <IntakeLanding brand={brand} slug={slug} refCode={refCode} siteKey={turnstileSiteKey()} />;
}
