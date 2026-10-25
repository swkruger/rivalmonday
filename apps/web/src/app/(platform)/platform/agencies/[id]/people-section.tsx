'use client';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Input, Label, TabsLink, TabsLinkList } from '@cs/ui';
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
const th = 'px-3 py-2 font-semibold';
const td = 'px-3 py-2';

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
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          People <span className="ml-2 text-sm font-normal text-muted-foreground">{countsLine(people)}</span>
        </h2>
        {canManage && <Button type="button" variant="outline" size="sm" onClick={() => open({ kind: 'invite' })}>Invite agency admin</Button>}
      </div>
      <ResultLine message={message} />
      <TabsLinkList aria-label="People views" className="max-w-full self-start overflow-x-auto">
        {tabs.map((t) => (
          <TabsLink key={t.key} asChild active={t.key === tab} className="flex-none px-3">
            <Link href={hrefs[t.key]} scroll={false}>{t.label}<span className="ml-1.5 text-xs text-muted-foreground">{t.n}</span></Link>
          </TabsLink>
        ))}
      </TabsLinkList>

      <div className="overflow-x-auto">
        {tab === 'team' && (team.length === 0 ? <Empty text="No one on the agency team." /> : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="text-muted-foreground"><th scope="col" className={th}>Name</th><th scope="col" className={th}>Email</th><th scope="col" className={th}>Role</th><th scope="col" className={th}>Clients</th>{canManage && <th scope="col" className={th}><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {team.map((p) => (
                <tr key={p.membershipId} className="border-t border-border">
                  <td className={`${td} font-semibold`}>{displayName(p)}</td>
                  <td className={`${td} text-muted-foreground`}>{p.email}</td>
                  <td className={td}>{roleLabel(p.role)}</td>
                  <td className={`${td} text-muted-foreground`}>{p.clients.length ? p.clients.map((c) => c.name).join(', ') : 'All clients'}</td>
                  {canManage && <td className={`${td} text-right`}>{rowMenu(p)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {tab === 'clients' && (clientPeople.length === 0 ? <Empty text="No client people yet." /> : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="text-muted-foreground"><th scope="col" className={th}>Name</th><th scope="col" className={th}>Email</th><th scope="col" className={th}>Role</th><th scope="col" className={th}>Client</th>{canManage && <th scope="col" className={th}><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {clientPeople.map((p) => (
                <tr key={p.membershipId} className="border-t border-border">
                  <td className={`${td} font-semibold`}>{displayName(p)}</td>
                  <td className={`${td} text-muted-foreground`}>{p.email}</td>
                  <td className={td}>{roleLabel(p.role)}</td>
                  <td className={`${td} text-muted-foreground`}>{p.clients.map((c) => c.name).join(', ') || '—'}</td>
                  {canManage && <td className={`${td} text-right`}>{rowMenu(p)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {tab === 'invites' && (people.invitations.length === 0 ? <Empty text="No pending invites." /> : (
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead><tr className="text-muted-foreground"><th scope="col" className={th}>Email</th><th scope="col" className={th}>Role</th><th scope="col" className={th}>Client</th><th scope="col" className={th}>Sent</th><th scope="col" className={th}>Expires</th>{canManage && <th scope="col" className={th}><span className="sr-only">Actions</span></th>}</tr></thead>
            <tbody>
              {people.invitations.map((i) => (
                <tr key={i.invitationId} className="border-t border-border">
                  <td className={td}>{i.email}</td>
                  <td className={td}>{roleLabel(i.role)}</td>
                  <td className={`${td} text-muted-foreground`}>{i.clientName ?? '—'}</td>
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>{formatDate(i.sentAt, { tz, now })}</td>
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>{formatDate(i.expiresAt, { tz, now })}</td>
                  {canManage && (
                    <td className={`${td} whitespace-nowrap text-right`}>
                      <Button type="button" variant="outline" size="sm" aria-label={`Resend invite to ${i.email}`} onClick={() => open({ kind: 'resend', invite: i })}>Resend</Button>{' '}
                      <Button type="button" variant="outline" size="sm" aria-label={`Revoke invite to ${i.email}`} onClick={() => open({ kind: 'revoke', invite: i })}>Revoke</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

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
                ? `${firstName(target.person)} will only see the clients assigned to them and can't manage the team, billing or settings.`
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
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-sm text-muted-foreground">{text}</p>;
}
