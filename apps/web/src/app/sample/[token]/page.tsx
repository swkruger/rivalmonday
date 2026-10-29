import { getSampleBrief } from '@cs/tools';
import { Tag, Wordmark } from '@cs/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BriefView } from '@/components/views/brief-view';
import { formatDate } from '@/lib/format';
import { activeEnvName } from '@/server/dev-guard';
import { webEnv } from '@/server/env';
import type { EvidenceRefs } from '@/server/evidence-refs';
import { toolDeps } from '@/server/tools';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sample brief', robots: { index: false, follow: false } };

/**
 * Phase 17a: the public, read-only sample starting point (`/sample/<token>`, 30-day signed link). Outside the app shell:
 * no nav, no Ask, no link into the app — the evidence chips open this link's own evidence route. Any miss is a 404.
 * The token lives in the URL: never logged; `proxy.ts` sends it with `Referrer-Policy: no-referrer`.
 */
export default async function SamplePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sample = await getSampleBrief(toolDeps(activeEnvName()), token, webEnv().authSecret, new Date());
  if (!sample) notFound();
  const tz = sample.timezone;
  const refs: EvidenceRefs = Object.fromEntries(
    sample.refs.map((r) => [r.evidenceId, { source: r.competitorName, channel: r.channelLabel, date: formatDate(r.capturedAt, { tz }) }]),
  );
  const base = `/sample/${encodeURIComponent(token)}/evidence/`;
  return (
    <main className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
        <Wordmark />
        <header className="flex flex-col items-start gap-2">
          <Tag>Sample brief</Tag>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Starting point for {sample.businessName}</h1>
          <p className="text-muted-ink">Prepared by Rival Monday from public information. Every claim links to the evidence behind it.</p>
        </header>
        <BriefView brief={sample.brief} agency={false} timezone={tz} surface="reading" titled={false} refs={refs} evidenceHref={(id) => base + encodeURIComponent(id)} />
        <footer className="border-t border-line pt-4 text-sm text-muted-ink">
          This is the first brief your clients would get, under your agency&apos;s brand. This link works until {formatDate(sample.expiresAt, { tz, withYear: 'always' })}.
        </footer>
      </div>
    </main>
  );
}
