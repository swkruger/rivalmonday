import type { SearchVisibilityView } from '@cs/tools';
import { Section, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { formatDate } from '@/lib/format';

/** 18b-2: page one of Google per keyword (section, not card). Reads `get_search_visibility`; the client's own row is highlighted. */
export function GoogleSearch({ view, tz }: { view: SearchVisibilityView; tz: string }) {
  return (
    <Section title="Google search" description="Page one for your keywords at your service-area centre, checked every week.">
      {view.keywords.length === 0 ? (
        <p className="text-sm text-muted-ink">No search results yet. They appear after the next weekly scan.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {view.keywords.map((k) => (
            <Section key={k.keyword} as="h3" title={`“${k.keyword}”`} description={`Checked ${formatDate(k.scannedAt, { tz })}`}>
              <TableFrame>
                <Table density="compact">
                  <caption className="sr-only">Page one of Google for {k.keyword}</caption>
                  <TableHeader><TableRow><TableHead scope="col">Position</TableHead><TableHead scope="col">Business</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {k.organic.map((o) => (
                      <TableRow key={`${o.rank}-${o.domain ?? o.name}`} data-self={o.self ? 'true' : undefined} className={o.self ? 'bg-primary-soft' : undefined}>
                        <TableCell className={o.self ? 'font-semibold text-primary-soft-text' : undefined}>{o.rank}</TableCell>
                        <TableCell className={o.self ? 'font-semibold text-primary-soft-text' : undefined}>
                          {o.self ? `You · ${o.name}` : o.name}
                          {o.domain && <span className="ml-2 text-xs font-normal text-muted-ink">{o.domain}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
              {k.localServicesAds && <p className="text-sm text-ink"><span className="font-semibold">Local Services ads shown:</span> {k.localServicesAds.names.join(', ')}</p>}
            </Section>
          ))}
        </div>
      )}
    </Section>
  );
}
