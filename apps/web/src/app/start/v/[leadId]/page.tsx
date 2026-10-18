import type { LeadPreview } from '@cs/db';
import { getPublicPreview, type PublicAgencyBranding } from '@cs/tools';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { dbs } from '@/server/db';
import { agencyBrand, type IntakeBrand, NOINDEX, platformBrand } from '../../brand';
import { IntakeShell, Panel } from '../../shell';
import { PreviewPoller } from './poller';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ leadId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** R4: a bad id or a bad/old view token → null → 404 (no difference between the two). */
const load = cache(async (leadId: string, t: string | string[] | undefined) =>
  (typeof t === 'string' && t.length > 0 && t.length <= 128 ? getPublicPreview(dbs().service, leadId, t) : null));

const brandOf = (b: { branding: 'agency' | 'platform'; agencyBranding: PublicAgencyBranding | null }): IntakeBrand =>
  (b.branding === 'agency' && b.agencyBranding ? agencyBrand(b.agencyBranding) : platformBrand());

/** The view token is in the URL: never send it on as a referrer. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const r = await load((await params).leadId, (await searchParams).t);
  const name = r ? brandOf(r).displayName : null;
  return { title: name ? `Your competitor snapshot · ${name}` : 'Not found', robots: NOINDEX, referrer: 'no-referrer' };
}

const rating = (r: number | null) => (r === null ? '—' : `${r} ★`);
const count = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-US'));

/** Phase 11c §3–§4: the free preview, reached from the verify link. Public, guarded by the view token. */
export default async function PreviewPage({ params, searchParams }: Props) {
  const r = await load((await params).leadId, (await searchParams).t);
  if (!r) notFound();
  const brand = brandOf(r);
  const agencyName = brand.kind === 'agency' ? brand.displayName : null;
  return (
    <IntakeShell brand={brand} wide>
      <h1 className="text-2xl font-bold">{r.businessName ? `Your competitor snapshot for ${r.businessName}` : 'Your competitor snapshot'}</h1>
      <Body preview={r.preview} agencyName={agencyName} />
    </IntakeShell>
  );
}

function Body({ preview, agencyName }: { preview: LeadPreview; agencyName: string | null }) {
  if (preview.status !== 'ready') {
    if (preview.status === 'failed') {
      return <Panel><p>{agencyName ? `We couldn't build your snapshot, but ${agencyName} has your details.` : "We couldn't build your snapshot, but we have your details."}</p></Panel>;
    }
    return <Panel><PreviewPoller /></Panel>; // `none` (job not started yet) renders like `pending`
  }
  return (
    <>
      <Panel>
        <h2 className="text-lg font-semibold">{preview.self.name}</h2>
        <p className="text-muted-foreground">
          {preview.self.rating === null ? 'No rating yet' : `${preview.self.rating} ★`}
          {preview.self.votes !== null ? ` · ${count(preview.self.votes)} reviews` : ''}
        </p>
      </Panel>
      {preview.nearby.length > 0 && (
        <Panel>
          <h2 className="text-lg font-semibold">Nearby competitors</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="text-right">Reviews</TableHead>
                <TableHead className="text-right">Distance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.nearby.map((n, i) => (
                <TableRow key={`${i}-${n.name}`}>
                  <TableCell className="font-medium">{n.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{rating(n.rating)}</TableCell>
                  <TableCell className="text-right tabular-nums">{count(n.votes)}</TableCell>
                  <TableCell className="text-right tabular-nums">{n.distanceKm.toFixed(1)} km</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
      {(preview.facts.length > 0 || preview.summary) && (
        <Panel>
          {preview.facts.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {preview.facts.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
          {preview.summary && <p>{preview.summary}</p>}
        </Panel>
      )}
      <p className="text-muted-foreground">
        {agencyName ? `${agencyName} will be in touch within one business day.` : "We'll match you with a local marketing partner and they'll be in touch."}
      </p>
    </>
  );
}
