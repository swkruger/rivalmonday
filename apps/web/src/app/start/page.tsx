import type { Metadata } from 'next';
import { NOINDEX, platformBrand, turnstileSiteKey } from './brand';
import { IntakeLanding } from './landing';
import { refParam } from './params';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Get your free competitor snapshot · Rival Monday', robots: NOINDEX };

/** Phase 11c §3 (L4): the platform intake page — Rival Monday branding until an agency is assigned. Public. */
export default async function PlatformIntakePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const refCode = refParam((await searchParams).ref);
  return <IntakeLanding brand={platformBrand()} slug={null} refCode={refCode} siteKey={turnstileSiteKey()} />;
}
