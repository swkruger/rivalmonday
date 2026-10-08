import type { ProspectReportData } from '@cs/db';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';

const count = (n: number | null) => (n === null ? 'not checked' : String(n));

/** Decision 11: figures only, straight from the stored data — no model text. */
export function ProspectLandscape({ data }: { data: ProspectReportData }) {
  const name = (b: ProspectReportData['businesses'][number]) => (
    <>
      {b.name} {b.self && <span className="text-muted-ink">(prospect)</span>}
    </>
  );
  return (
    <div className="flex flex-col gap-6">
      <Table aria-label="Google profile and ads">
        <TableHeader>
          <TableRow><TableHead>Business</TableHead><TableHead>Rating</TableHead><TableHead>Reviews</TableHead><TableHead>Category</TableHead><TableHead>Google ads running</TableHead><TableHead>Meta ads running</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {data.businesses.map((b) => (
            <TableRow key={b.competitorId}>
              <TableCell className="font-semibold">{name(b)}</TableCell>
              <TableCell>{b.gbp?.rating ?? '—'}</TableCell>
              <TableCell>{b.gbp?.reviews ?? '—'}</TableCell>
              <TableCell>{b.gbp?.category ?? '—'}{b.gbp && b.gbp.extraCategories > 0 ? ` +${b.gbp.extraCategories}` : ''}</TableCell>
              <TableCell>{count(b.ads.google)}</TableCell>
              <TableCell>{count(b.ads.meta)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Table aria-label="Map visibility">
        <TableHeader>
          <TableRow><TableHead>Business</TableHead>{data.keywords.map((k) => <TableHead key={k}>“{k}”</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {data.businesses.map((b) => (
            <TableRow key={b.competitorId}>
              <TableCell className="font-semibold">{name(b)}</TableCell>
              {b.ranks.map((r) => (
                <TableCell key={r.keyword}>{r.found === 0 ? `not in the top 20 at any of ${data.points} points` : `${r.found}/${data.points} · top 3: ${r.top3} · avg ${r.averageRank}`}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.notes.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-ink">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <p className="text-xs text-muted-ink">Generated {data.generatedAt.slice(0, 10)} from Google Business Profile, ad-library and Google Maps data across a 3×3 grid of the service area. No AI-written text.</p>
    </div>
  );
}
