import { isAgencyRole } from '@cs/core';
import type { ClientSummary, PendingInvite, TeamMember } from '@cs/tools';
import { Section, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/help/empty-state';
import { HelpText } from '@/components/help/help-context';
import { TipRow } from '@/components/help/tip-row';
import { WriteGuard } from '@/components/read-only';
import { PageHeader } from '@/components/page-header';
import { PAGE_COPY } from '@/help/copy';
import { formatDate } from '@/lib/format';
import { labelFor, MEMBERSHIP_ROLE } from '@/lib/labels';
import { requireContext } from '@/server/current-viewer';
import { helpGuides } from '@/server/help';
import { callTool } from '@/server/tools';
import { viewerTimeZone } from '@/server/viewer-tz';
import { InvitationTable, InviteForm, RemoveMemberButton } from './invite-form';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Team' };

const HELP_KEY = 'page:agency.settings.team';
const COPY = PAGE_COPY['agency.settings.team'];

export default async function TeamPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  // 7a2: a registered read (audited in a support session); 8b masks its emails there before anything reaches a client component.
  const [{ members, invitations }, { items: clients }, guides, tz] = await Promise.all([
    callTool<{ members: TeamMember[]; invitations: PendingInvite[] }>(ctx, 'get_team', {}),
    callTool<{ items: ClientSummary[] }>(ctx, 'list_clients', {}),
    helpGuides(ctx, 'agency'),
    viewerTimeZone(),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const scopeLabel = (m: { clientId: string | null; clientScope: string[] | null }): string => {
    if (m.clientId) return clientName.get(m.clientId) ?? 'Unknown client';
    if (m.clientScope && m.clientScope.length) return m.clientScope.map((id) => clientName.get(id) ?? 'Unknown client').join(', ');
    return 'All clients';
  };

  return (
    <>
      <PageHeader
        title="Team"
        breadcrumb={[{ label: 'Agency settings', href: '/agency/settings' }, { label: 'Team' }]}
        description={<HelpText text={COPY.description} />}
        helpKey={HELP_KEY}
        guide={guides.has(HELP_KEY)}
      />
      <TipRow
        items={[
          { label: 'Roles', tip: 'agency.settings.team.roles' },
          { label: 'Assigned clients', tip: 'agency.settings.team.scope' },
          { label: 'Invitations', tip: 'agency.settings.team.invitations' },
          { label: 'Removing', tip: 'agency.settings.team.removing' },
        ]}
      />
      <Section title="Members">
        {members.length === 0 ? (
          <EmptyState {...COPY.empty.noMembers} guideAnchor="what-this-page-tells-you" />
        ) : (
          <TableFrame>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Client</TableHead>
                  <WriteGuard>
                    <TableHead />
                  </WriteGuard>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.membershipId}>
                    <TableCell className="font-medium">{m.name || m.email}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>{labelFor(MEMBERSHIP_ROLE, m.role).label}</TableCell>
                    <TableCell>{scopeLabel(m)}</TableCell>
                    <WriteGuard>
                      <TableCell>
                        <RemoveMemberButton membershipId={m.membershipId} name={m.name || m.email} />
                      </TableCell>
                    </WriteGuard>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        )}
        <WriteGuard>
          <div className="border-t border-line pt-5">
            <InviteForm clients={clients} canInviteAgencyRoles={ctx.role === 'agency_admin'} />
          </div>
        </WriteGuard>
      </Section>
      <Section ruled title="Pending invitations">
        {invitations.length === 0 ? (
          <EmptyState {...COPY.empty.noInvites} guideAnchor="common-questions" />
        ) : (
          <TableFrame>
            <InvitationTable
              invitations={invitations.map((i) => ({
                id: i.id,
                email: i.email,
                roleLabel: labelFor(MEMBERSHIP_ROLE, i.role).label,
                clientLabel: i.clientId ? (i.clientName ?? 'Unknown client') : 'All clients',
                dates: `${formatDate(i.sentAt, { tz })} · expires ${formatDate(i.expiresAt, { tz })}`,
              }))}
            />
          </TableFrame>
        )}
      </Section>
    </>
  );
}
