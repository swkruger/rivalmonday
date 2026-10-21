import { platformRole } from '@cs/tools';
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { requireOperatorContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { helpGuides } from '@/server/help';
import { platformAdmins } from '@/server/runtime-env';
import { callTool } from '@/server/tools';
import { type AgencyOption, AssignForm } from './assign-form';

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

const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');

/** Phase 11c §6: the pool of verified platform leads. Operators only (a refusal is a 404); only owner and staff can assign. */
export default async function PlatformLeadsPage() {
  const { ctx } = await requireOperatorContext();
  const [{ leads, agencies, recentAssignments }, role, guides] = await Promise.all([
    callTool<{ leads: PoolLead[]; agencies: AgencyOption[]; recentAssignments: Recent[] }>(ctx, 'list_pool_leads', {}),
    platformRole({ service: dbs().service, platformAdmins: platformAdmins() }, ctx),
    helpGuides(ctx, 'platform'),
  ]);
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
      <Card>
        <CardHeader>
          <CardTitle>Pool ({leads.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <EmptyState {...COPY.empty.pool} guideAnchor="what-this-page-tells-you" />
          ) : (
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
                      <div className="font-semibold">{l.businessName}</div>
                      {l.declinedBack && <Badge variant="secondary">Declined by an agency</Badge>}
                      <div className="text-xs text-muted-foreground">{[l.address ?? l.city, l.category].filter(Boolean).join(' · ')}</div>
                      {l.message && <div className="mt-1 max-w-md whitespace-pre-wrap text-xs">{l.message}</div>}
                    </TableCell>
                    <TableCell>
                      <div>{l.contactName}</div>
                      <div className="text-xs text-muted-foreground">{l.email}{l.phone ? ` · ${l.phone}` : ''}</div>
                      {l.ref && <div className="text-xs text-muted-foreground">Ref {l.ref}</div>}
                    </TableCell>
                    <TableCell>{day(l.verifiedAt ?? l.createdAt)}</TableCell>
                    {canAssign && (
                      <TableCell>
                        <AssignForm leadId={l.id} agencies={agencies} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAssignments.length === 0 ? (
            <EmptyState {...COPY.empty.assigned} />
          ) : (
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
                    <TableCell className="font-semibold">{r.businessName}</TableCell>
                    <TableCell>{r.agencyName}</TableCell>
                    <TableCell>{day(r.assignedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
