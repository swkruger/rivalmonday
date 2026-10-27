'use client';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, Section, TabsLink, TabsLinkList, Table, TableBody, TableCell, TableFrame, TableHead, TableHeader, TableRow } from '@cs/ui';
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatDate } from '@/lib/format';
import { MEMBERSHIP_ROLE, labelFor } from '@/lib/labels';
import { ActionDialog, ResultLine } from './action-dialog';
import { changeMemberRoleAction, inviteAgencyAdminAction, removeMemberAction, resendInvitationAction, revokeInvitationAction } from './actions';

export interface AgencyPerson { membershipId: string; userId: string; name: string; email: string; role: string; clients: { id: string; name: string }[] }
export interface AgencyInvite { invitationId: string; email: string; role: string; clientId: string | null; clientName: string | null; sentAt: string; expiresAt: string }
/** `list_agency_people` output. */
export interface AgencyPeople { members: AgencyPerson[]; invitations: AgencyInvite[] }
export type PeopleTab = 'team' | 'clients' | 'invites';

const AGENCY_ROLES = new Set(['agency_admin', 'account_manager']);
const COUNT_ROLES = ['agency_admin', 'account_manager', 'client_owner', 'client_viewer'] as const;
const roleLabel = (r: string) => labelFor(MEMBERSHIP_ROLE, r).label;
const displayName = (p: AgencyPerson) => p.name.trim() || p.email;
const firstName = (p: AgencyPerson) => p.name.trim().split(/\s+/)[0] || p.email;
const counted = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

type Target =
  | { kind: 'invite' }
  | { kind: 'role'; person: AgencyPerson; role: 'agency_admin' | 'account_manager' }
  | { kind: 'remove'; person: AgencyPerson }
  | { kind: 'resend' | 'revoke'; invite: AgencyInvite };

/** "2 agency admins · 1 account manager · … · 1 pending invite" (zero counts left out). */
function countsLine(p: AgencyPeople): string {
  const parts = COUNT_ROLES.flatMap((r) => {
    const n = p.members.filter((m) => m.role === r).length;
    return n ? [counted(n, roleLabel(r).toLowerCase())] : [];
  });
  if (p.invitations.length) parts.push(counted(p.invitations.length, 'pending invite'));
  return parts.length ? parts.join(' · ') : 'No people yet';
}

/**
 * Spec §4.5 / mockup pages 2–4: the agency's people in three URL tabs (`?people=`). Staff+ (`canManage`) get the Invite
 * agency admin button, row menus (agency roles: switch admin ↔ account manager, remove; client people: remove only — C5,
 * no step into a client) and Resend/Revoke on invites; viewers and the archived view get read-only tables. One dialog and
 * one result line for the whole section, so both survive a row leaving the list on revalidate.
 */
export function PeopleSection({ agency, people, tab, hrefs, canManage, tz, nowMs }: {
  agency: { id: string; name: string };
  people: AgencyPeople;
  tab: PeopleTab;
  hrefs: Record<PeopleTab, string>;
  canManage: boolean;
  tz: string;
  nowMs?: number;
}) {
  const now = new Date(nowMs ?? Date.now());
  const [target, setTarget] = useState<Target | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const team = people.members.filter((m) => AGENCY_ROLES.has(m.role));
  const clientPeople = people.members.filter((m) => !AGENCY_ROLES.has(m.role));
  const tabs: { key: PeopleTab; label: string; n: number }[] = [
    { key: 'team', label: 'Agency team', n: team.length },
    { key: 'clients', label: 'Client people', n: clientPeople.length },
    { key: 'invites', label: 'Pending invites', n: people.invitations.length },
  ];
  const open = (t: Target) => {
    setMessage(null);
    if (t.kind === 'invite') setEmail('');
    setTarget(t);
  };
  const common = {
    onOpenChange: (v: boolean) => { if (!v) setTarget(null); },
    onDone: (m: string | undefined) => setMessage(m ?? null),
  };

  const rowMenu = (p: AgencyPerson) => canManage && (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${displayName(p)}`}><MoreHorizontal aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {p.role === 'agency_admin' && <DropdownMenuItem onSelect={() => open({ kind: 'role', person: p, role: 'account_manager' })}>Make account manager</DropdownMenuItem>}
        {p.role === 'account_manager' && <DropdownMenuItem onSelect={() => open({ kind: 'role', person: p, role: 'agency_admin' })}>Make agency admin</DropdownMenuItem>}
        {AGENCY_ROLES.has(p.role) && <DropdownMenuSeparator />}
        <DropdownMenuItem variant="destructive" onSelect={() => open({ kind: 'remove', person: p })}>Remove from agency</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Section
      ruled
      title={<>People <span className="ml-2 text-sm font-normal text-muted-ink">{countsLine(people)}</span></>}
      actions={canManage ? <Button type="button" variant="outline" size="sm" onClick={() => open({ kind: 'invite' })}>Invite agency admin</Button> : undefined}
    >
      <ResultLine message={message} />
      <TabsLinkList aria-label="People views" className="max-w-full self-start overflow-x-auto">
        {tabs.map((t) => (
          <TabsLink key={t.key} asChild active={t.key === tab} className="flex-none px-3">
            <Link href={hrefs[t.key]} scroll={false}>{t.label}<span className="ml-1.5 text-xs text-muted-ink">{t.n}</span></Link>
          </TabsLink>
        ))}
      </TabsLinkList>

      <>
        {tab === 'team' && (team.length === 0 ? <Empty text="No one on the agency team." /> : (
          <TableFrame><Table className="min-w-[560px]">
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead scope="col">Name</TableHead><TableHead scope="col">Email</TableHead><TableHead scope="col">Role</TableHead><TableHead scope="col">Clients</TableHead>{canManage && <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {team.map((p) => (
                <TableRow key={p.membershipId}>
                  <TableCell className="font-semibold">{displayName(p)}</TableCell>
                  <TableCell className="text-muted-ink">{p.email}</TableCell>
                  <TableCell>{roleLabel(p.role)}</TableCell>
                  <TableCell className="text-muted-ink">{p.clients.length ? p.clients.map((c) => c.name).join(', ') : 'All clients'}</TableCell>
                  {canManage && <TableCell className="text-right">{rowMenu(p)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table></TableFrame>
        ))}
        {tab === 'clients' && (clientPeople.length === 0 ? <Empty text="No client people yet." /> : (
          <TableFrame><Table className="min-w-[560px]">
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead scope="col">Name</TableHead><TableHead scope="col">Email</TableHead><TableHead scope="col">Role</TableHead><TableHead scope="col">Client</TableHead>{canManage && <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {clientPeople.map((p) => (
                <TableRow key={p.membershipId}>
                  <TableCell className="font-semibold">{displayName(p)}</TableCell>
                  <TableCell className="text-muted-ink">{p.email}</TableCell>
                  <TableCell>{roleLabel(p.role)}</TableCell>
                  <TableCell className="text-muted-ink">{p.clients.map((c) => c.name).join(', ') || '—'}</TableCell>
                  {canManage && <TableCell className="text-right">{rowMenu(p)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table></TableFrame>
        ))}
        {tab === 'invites' && (people.invitations.length === 0 ? <Empty text="No pending invites." /> : (
          <TableFrame><Table className="min-w-[620px]">
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead scope="col">Email</TableHead><TableHead scope="col">Role</TableHead><TableHead scope="col">Client</TableHead><TableHead scope="col">Sent</TableHead><TableHead scope="col">Expires</TableHead>{canManage && <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {people.invitations.map((i) => (
                <TableRow key={i.invitationId}>
                  <TableCell>{i.email}</TableCell>
                  <TableCell>{roleLabel(i.role)}</TableCell>
                  <TableCell className="text-muted-ink">{i.clientName ?? '—'}</TableCell>
                  <TableCell className="text-muted-ink">{formatDate(i.sentAt, { tz, now })}</TableCell>
                  <TableCell className="text-muted-ink">{formatDate(i.expiresAt, { tz, now })}</TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" aria-label={`Resend invite to ${i.email}`} onClick={() => open({ kind: 'resend', invite: i })}>Resend</Button>{' '}
                      <Button type="button" variant="outline" size="sm" aria-label={`Revoke invite to ${i.email}`} onClick={() => open({ kind: 'revoke', invite: i })}>Revoke</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table></TableFrame>
        ))}
      </>

      {canManage && (
        <>
          <ActionDialog
            {...common}
            open={target?.kind === 'invite'}
            fields={{ agencyId: agency.id }}
            title="Invite an agency admin"
            body={`They get an email from ${agency.name} with a link to join as an agency admin.`}
            confirmLabel="Send invite"
            canSubmit={email.trim().length > 0}
            action={inviteAgencyAdminAction}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="invite-admin-email">Email</Label>
              <Input id="invite-admin-email" name="email" type="email" required maxLength={320} autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </ActionDialog>
          {target?.kind === 'role' && (
            <ActionDialog
              {...common}
              open
              fields={{ agencyId: agency.id, membershipId: target.person.membershipId, role: target.role }}
              title={target.role === 'account_manager' ? `Make ${displayName(target.person)} an account manager?` : `Make ${displayName(target.person)} an agency admin?`}
              body={target.role === 'account_manager'
                ? `${firstName(target.person)} will still see every client but can't manage the team, billing or settings. The agency can limit their clients in Team settings.`
                : `${firstName(target.person)} will see every client and can manage the team, billing and settings.`}
              confirmLabel="Change role"
              action={changeMemberRoleAction}
            />
          )}
          {target?.kind === 'remove' && (
            <ActionDialog
              {...common}
              open
              fields={{ agencyId: agency.id, membershipId: target.person.membershipId }}
              title={`Remove ${displayName(target.person)} from ${agency.name}?`}
              body={`${firstName(target.person)} loses access to the agency and its clients right away. Their past activity stays.`}
              confirmLabel="Remove"
              tone="danger"
              action={removeMemberAction}
            />
          )}
          {target?.kind === 'resend' && (
            <ActionDialog
              {...common}
              open
              fields={{ agencyId: agency.id, invitationId: target.invite.invitationId }}
              title={`Resend the invite to ${target.invite.email}?`}
              body="They get a new email with a link to join. An invite can be resent 3 times a day."
              confirmLabel="Resend"
              action={resendInvitationAction}
            />
          )}
          {target?.kind === 'revoke' && (
            <ActionDialog
              {...common}
              open
              fields={{ agencyId: agency.id, invitationId: target.invite.invitationId }}
              title={`Revoke the invite to ${target.invite.email}?`}
              body="The link in their email stops working."
              confirmLabel="Revoke"
              tone="danger"
              action={revokeInvitationAction}
            />
          )}
        </>
      )}
    </Section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-sm text-muted-ink">{text}</p>;
}
