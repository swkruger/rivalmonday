import type { Metadata } from 'next';
import Link from 'next/link';
import { agencyIntake, type IntakeBrand, neutralBrand, NOINDEX, platformBrand } from '../brand';
import { SLUG_RE } from '../params';
import { OnboardingShell, type OnboardingBrand } from '@/components/onboarding/onboarding-shell';

export const dynamic = 'force-dynamic';

const shellBrand = (b: IntakeBrand): OnboardingBrand =>
  b.kind === 'agency' ? { kind: 'agency', name: b.displayName, logoUrl: b.logoUrl, style: b.style as React.CSSProperties } : { kind: b.kind };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** No `from` = the platform page; a live agency slug = that agency's page; anything else names nobody. */
async function origin(from: string | string[] | undefined): Promise<{ brand: IntakeBrand; href: string | null }> {
  if (from === undefined) return { brand: platformBrand(), href: '/start' };
  if (typeof from === 'string' && SLUG_RE.test(from)) {
    const brand = await agencyIntake(from);
    if (brand) return { brand, href: `/start/${from}` };
  }
  return { brand: neutralBrand(), href: null };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { brand } = await origin((await searchParams).from);
  return { title: brand.displayName ? `Link expired · ${brand.displayName}` : 'Link expired', robots: NOINDEX };
}

/** Phase 11c §3: where an unknown, expired or decided verify link lands (`/start/verify/<token>` redirects here). */
export default async function IntakeLinkExpiredPage({ searchParams }: Props) {
  const { brand, href } = await origin((await searchParams).from);
  return (
    <OnboardingShell brand={shellBrand(brand)} title="This link has expired." wide>
      {href ? (
        <Link href={href} className="self-start font-semibold text-secondary underline">Start again.</Link>
      ) : (
        <p className="text-[15px] text-muted-ink">Start again from the page where you asked for your snapshot.</p>
      )}
    </OnboardingShell>
  );
}
