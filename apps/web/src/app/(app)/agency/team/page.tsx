import { isAgencyRole, type Role } from '@cs/core';
import type { ClientSummary } from '@cs/tools';
import { listTeam } from '@cs/tools';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@cs/ui';
import { notFound } from 'next/navigation';
import { requireContext } from '@/server/current-viewer';
import { dbs } from '@/server/db';
import { callTool } from '@/server/tools';
import { InviteForm, RemoveMemberButton, RevokeInvitationButton } from './invite-form';

export const dynamic = 'force-dynamic';

const ROLE_LABELS: Record<Role, string> = { agency_admin: 'Admin', account_manager: 'Account manager', client_owner: 'Client owner', client_viewer: 'Client viewer' };

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function TeamPage() {
  const { ctx } = await requireContext();
  if (!isAgencyRole(ctx.role)) notFound();
  const [{ members, invitations }, { items: clients }] = await Promise.all([listTeam(dbs().service, ctx), callTool<{ items: ClientSummary[] }>(ctx, 'list_clients', {})]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const scopeLabel = (m: { clientId: string | null; clientScope: string[] | null }): string => {
    if (m.clientId) return clientName.get(m.clientId) ?? 'Unknown client';
    if (m.clientScope && m.clientScope.length) return m.clientScope.map((id) => clientName.get(id) ?? 'Unknown client').join(', ');
    return 'All clients';
  };

  return (
    <>
      <h1 className="text-[26px] font-extrabold tracking-tight">Team</h1>
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {members.length === 0 ? (
            <p className="text-muted-foreground">No members yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.membershipId}>
                    <TableCell className="font-medium">{m.name || m.email}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>{ROLE_LABELS[m.role]}</TableCell>
                    <TableCell>{scopeLabel(m)}</TableCell>
                    <TableCell>
                      <RemoveMemberButton membershipId={m.membershipId} name={m.name || m.email} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="border-t border-line pt-5">
            <InviteForm clients={clients} canInviteAgencyRoles={ctx.role === 'agency_admin'} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-muted-foreground">No pending invitations.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>{ROLE_LABELS[i.role]}</TableCell>
                    <TableCell>{i.clientId ? i.clientName ?? 'Unknown client' : 'All clients'}</TableCell>
                    <TableCell>{formatDate(i.expiresAt)}</TableCell>
                    <TableCell>
                      <RevokeInvitationButton invitationId={i.id} email={i.email} />
                    </TableCell>
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
