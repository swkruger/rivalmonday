import { platformRole } from '@cs/tools';
import { Section, StatusChip, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { OffPageNotice, PrevNext } from '@/components/prev-next';
import { formatDate } from '@/lib/format';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { verticalOptions } from '@/server/verticals';
import { viewerTimeZone } from '@/server/viewer-tz';
import { type AgencyOption, AssignForm, AssignScope } from './assign-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Lead pool' };

const HELP_KEY = 'page:platform.leads';
const COPY = PAGE_COPY['platform.leads'];

interface PoolLead {
  id: string;
  ref: string | null;
  businessName: string;
  address: string | null;
  city: string | null;
  category: string | null;
  contactName: string;
  email: string;
  phone: string | null;
  message: string | null;
  verifiedAt: Date | string | null;
  createdAt: Date | string;
  declinedBack: boolean;
}
interface Recent {
  leadId: string;
  businessName: string;
  agencyName: string;
  assignedAt: Date | string;
}

interface Search { cursor?: string | string[] }
const leadsHref = (cursor: string) => `/platform/leads?cursor=${encodeURIComponent(cursor)}`;

/** Phase 11c §6: the pool of verified platform leads. Operators only (a refusal is a 404); only owner and staff can assign. */
export default async function PlatformLeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.cursor) ? sp.cursor[0] : sp.cursor;
  const cursor = raw?.slice(0, 200) || undefined;
  const { ctx } = await requireOperatorContext();
  const [pool, role, guides, tz, catalogue] = await Promise.all([
    callTool<{ leads: PoolLead[]; agencies: AgencyOption[]; recentAssignments: Recent[]; nextCursor: string | null; prevCursor: string | null; total: number }>(ctx, 'list_pool_leads', cursor ? { cursor } : {}),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
    helpGuides(ctx, 'platform'),
    viewerTimeZone(),
    verticalOptions(),
  ]);
  const { leads, recentAssignments, nextCursor, prevCursor, total } = pool;
  // The picker shows business-type names, never slugs (an id the catalogue no longer lists falls back to itself).
  const names = new Map(catalogue.map((v) => [v.id, v.name]));
  const agencies = pool.agencies.map((a) => ({ ...a, verticals: a.verticals.map((v) => names.get(v) ?? v) }));
  const canAssign = role === 'owner' || role === 'staff';
  return (
    <>
      <PageHeader
        title="Lead pool"
        breadcrumb={[{ label: 'Platform', href: '/platform' }, { label: 'Lead pool' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'About the pool', tip: 'platform.leads.pool' },
          { label: 'About giving a lead', tip: 'platform.leads.giving' },
          { label: 'About returned leads', tip: 'platform.leads.declined' },
        ]}
      />
      <Section title={`Pool (${total})`}>
        <AssignScope>
          {leads.length === 0 && (total > 0 || prevCursor) ? (
            <OffPageNotice firstHref="/platform/leads" />
          ) : leads.length === 0 ? (
            <EmptyState {...COPY.empty.pool} guideAnchor="what-this-page-tells-you" />
          ) : (
            <TableFrame>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Verified</TableHead>
                    {canAssign && <TableHead>Assign</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-semibold text-ink">{l.businessName}</div>
                        {l.declinedBack && <StatusChip tone="warning">Declined by an agency</StatusChip>}
                        <div className="text-xs text-muted-ink">{[l.address ?? l.city, l.category].filter(Boolean).join(' · ')}</div>
                        {l.message && <div className="mt-1 max-w-md whitespace-pre-wrap text-xs">{l.message}</div>}
                      </TableCell>
                      <TableCell>
                        <div>{l.contactName}</div>
                        <div className="text-xs text-muted-ink">{l.email}{l.phone ? ` · ${l.phone}` : ''}</div>
                        {l.ref && <div className="text-xs text-muted-ink">Ref {l.ref}</div>}
                      </TableCell>
                      <TableCell>{l.verifiedAt ? formatDate(l.verifiedAt, { tz }) : '—'}</TableCell>
                      {canAssign && (
                        <TableCell>
                          <AssignForm leadId={l.id} leadName={l.businessName} agencies={agencies} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          )}
        </AssignScope>
      </Section>
      <PrevNext previous={prevCursor ? leadsHref(prevCursor) : null} next={nextCursor ? leadsHref(nextCursor) : null} />
      <Section ruled title="Recent assignments">
        {recentAssignments.length === 0 ? (
          <EmptyState {...COPY.empty.assigned} />
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Assigned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAssignments.map((r) => (
                  <TableRow key={r.leadId}>
                    <TableCell className="font-semibold text-ink">{r.businessName}</TableCell>
                    <TableCell>{r.agencyName}</TableCell>
                    <TableCell>{formatDate(r.assignedAt, { tz })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </Section>
    </>
  );
}
