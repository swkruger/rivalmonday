import type { Metadata } from 'next';
import Link from 'next/link';
import { agencyIntake, type IntakeBrand, neutralBrand, NOINDEX, platformBrand } from '../brand';
import { SLUG_RE } from '../params';
import { IntakeShell, Panel } from '../shell';

export const dynamic = 'force-dynamic';

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

/** Phase 11c §3: where an unknown, used or expired verify link lands (`/start/verify/<token>` redirects here). */
export default async function IntakeLinkExpiredPage({ searchParams }: Props) {
  const { brand, href } = await origin((await searchParams).from);
  return (
    <IntakeShell brand={brand}>
      <Panel>
        <h1 className="text-xl font-bold">This link has expired.</h1>
        {href ? (
          <Link href={href} className="self-start font-semibold text-secondary underline">Start again.</Link>
        ) : (
          <p>Start again from the page where you asked for your snapshot.</p>
        )}
      </Panel>
    </IntakeShell>
  );
}
