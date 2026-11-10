import type { CitationAuditView } from '@cs/tools';
import { Section, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { HelpTip } from '@/components/help/help-tip';
import { formatPhone } from '@/components/place-summary';
import { formatDate } from '@/lib/format';
import { CITATION_STATUS, labelFor } from '@/lib/labels';

type Business = CitationAuditView['businesses'][number];
type Listing = Business['listings'][number];

const MAX_RIVALS = 3;
const LINK = 'font-semibold text-primary-soft-text';
const NEVER = 'Your first check runs once your competitors are set.';
const NO_SELF = 'Link your Google listing in Client settings to check your listings.';

function Chip({ status }: { status: Listing['status'] }) {
  const { label, tone } = labelFor(CITATION_STATUS, status);
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>{children}</a>;
}

/** Name, phone and address lines of a listed row (spec § Copy). A differing phone may be a tracking number, so it is shown, never called wrong. */
function details(l: Listing): string[] {
  if (l.status !== 'listed') return [];
  const out: string[] = [];
  if (l.nameMatch !== null) out.push(l.nameMatch ? 'Name matches' : 'Name differs');
  if (l.phoneMatch === true) out.push('Phone matches');
  else if (l.phoneMatch === false) out.push(l.shownPhone ? `Shows a different phone: ${formatPhone(l.shownPhone)}` : 'Shows a different phone');
  out.push('Address: not checked');
  return out;
}

function YourListings({ audit, self }: { audit: CitationAuditView; self: Business }) {
  const byHost = new Map(self.listings.map((l) => [l.host, l]));
  return (
    <TableFrame>
      <Table density="compact">
        <caption className="sr-only">Your listings on major directories</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Directory</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col"><span className="inline-flex items-center gap-1.5"><span>Details</span><HelpTip tip="client.listings.nameMatch" /></span></TableHead>
            <TableHead scope="col"><span className="sr-only">Link</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {audit.directories.map((d) => {
            const l = byHost.get(d.host);
            const status = l?.status ?? 'not_checked';
            return (
              <TableRow key={d.host}>
                <TableHead scope="row" className="text-sm font-medium text-ink">{d.label}</TableHead>
                <TableCell><Chip status={status} /></TableCell>
                <TableCell>{l ? details(l).join(' · ') : null}</TableCell>
                <TableCell>
                  {status === 'not_found' && <External href={d.addListingUrl}>Add listing{' '}<span className="sr-only">on {d.label}</span></External>}
                  {status === 'listed' && l?.listingUrl && <External href={l.listingUrl}>View listing{' '}<span className="sr-only">on {d.label}</span></External>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

function RivalMatrix({ audit, columns }: { audit: CitationAuditView; columns: Business[] }) {
  return (
    <TableFrame>
      <Table density="compact">
        <caption className="sr-only">Directory listings for you and your top rivals</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Directory</TableHead>
            {columns.map((b) => <TableHead key={b.competitorId} scope="col">{b.self ? 'You' : b.name}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {audit.directories.map((d) => (
            <TableRow key={d.host}>
              <TableHead scope="row" className="text-sm font-medium text-ink">{d.label}</TableHead>
              {columns.map((b) => (
                <TableCell key={b.competitorId}><Chip status={b.listings.find((l) => l.host === d.host)?.status ?? 'not_checked'} /></TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

/** 18c-1 Listings page body: one sheet, three sections (spec § Listings page). Reads only the `get_citation_audit` view. */
export function ListingsView({ audit, tz }: { audit: CitationAuditView; tz: string }) {
  const never = audit.status === 'never';
  const self = audit.selfMissing ? undefined : audit.businesses.find((b) => b.self);
  const columns = [...(self ? [self] : []), ...audit.businesses.filter((b) => !b.self).slice(0, MAX_RIVALS)];
  return (
    <>
      <Section
        title="Your listings"
        titleAside={<HelpTip tip="client.listings.notFound" />}
        description={!never && audit.checkedAt ? `Checked ${formatDate(audit.checkedAt, { tz })}.` : undefined}
      >
        {never ? (
          <p className="text-sm text-muted-ink">{NEVER}</p>
        ) : self ? (
          <YourListings audit={audit} self={self} />
        ) : (
          <p className="rounded-md bg-muted-surface p-3 text-sm text-ink">{NO_SELF}</p>
        )}
      </Section>

      {!never && columns.length > 0 && (
        <Section title="You vs top rivals">
          <RivalMatrix audit={audit} columns={columns} />
        </Section>
      )}

      {!never && audit.alsoFoundOn.length > 0 && (
        <Section title="Also found on" titleAside={<HelpTip tip="client.listings.alsoFound" />}>
          <ul className="flex flex-col gap-2 text-sm">
            {audit.alsoFoundOn.map((a) => <li key={a.host}><External href={a.listingUrl}>{a.host}</External></li>)}
          </ul>
        </Section>
      )}
    </>
  );
}
