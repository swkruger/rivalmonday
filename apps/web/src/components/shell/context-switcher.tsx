'use client';

import { Command, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, Popover, PopoverContent, PopoverTrigger } from '@cs/ui';
import { ArrowLeft, Building2, ChevronsUpDown, Globe, Pin, Plus, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { switchMembership } from '@/app/(app)/actions';
import type { NavContext, NavRoleFlags } from './nav-items';
import { pushRecent, readPins, readRecent, togglePin } from './switcher-storage';
import { type NavFallback, useNavContext } from './use-nav-context';

export interface SwitcherClient {
  id: string;
  name: string;
  /** The vertical's display name (agency roles), else null. */
  sub: string | null;
  /** Setup incomplete; false when no cheap source exists (15a). */
  setup: boolean;
}

/** One of the viewer's memberships, for client roles with more than one (spec §2.4 last bullet). */
export interface SwitcherAccount {
  membershipId: string;
  name: string;
  sub: string | null;
}

/**
 * Plain, client-safe props built by `AppShell`. Navigation only (D3): every list holds the viewer's own memberships or
 * clients. `currentMembershipId` null (support session, guest) = no Recent/pins storage at all.
 * `fallback` + the zone feed the shared `useNavContext`, so this agrees with `SidebarNav` on the current context.
 */
export interface SwitcherProps {
  zone?: 'platform';
  flags: NavRoleFlags;
  agencyName: string;
  clients: SwitcherClient[];
  ownAgencies: { membershipId: string; name: string }[];
  currentMembershipId: string | null;
  supportAgency: { name: string; backHref: string } | null;
  fallback: NavFallback | null;
  /** Client roles: every membership of the viewer (the current one included); [] for agency roles and guests. */
  accounts: SwitcherAccount[];
}

type Current = { context: NavContext; name: string; sub: string | null };

/** The trigger's (and the top bar's) name for the live context. */
function useCurrent(p: SwitcherProps): Current & { clientId: string | null } {
  const { context, clientId } = useNavContext({ flags: p.flags, zone: p.zone, fallback: p.fallback, clients: p.clients });
  const agency = { context: 'agency' as const, name: p.supportAgency?.name ?? p.agencyName, sub: 'Agency view' };
  if (context === 'platform') return { context, name: 'Platform', sub: 'Operator console', clientId };
  if (context === 'agency') return { ...agency, clientId };
  const c = p.clients.find((x) => x.id === clientId) ?? (p.flags.isAgency ? undefined : p.clients[0]);
  if (c) return { context, name: c.name, sub: c.sub, clientId: c.id };
  return p.flags.isAgency ? { ...agency, clientId: null } : { context, name: p.agencyName, sub: null, clientId: null };
}

const ICON = { platform: Globe, agency: Building2, client: Store } as const;

function Card({ current, interactive }: { current: Current; interactive: boolean }) {
  const Icon = ICON[current.context];
  return (
    <>
      <span aria-hidden className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-text">
        <Icon className="h-4 w-4" strokeWidth={1.9} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-ink">{current.name}</span>
        {current.sub && <span className="truncate text-xs text-muted-ink">{current.sub}</span>}
      </span>
      {interactive && <ChevronsUpDown aria-hidden className="h-4 w-4 flex-shrink-0 text-muted-ink" />}
    </>
  );
}

const CARD = 'flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-left';
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
const matches = (q: string, ...fields: (string | null)[]) => fields.some((f) => f?.toLowerCase().includes(q));

/** Below `lg` the top bar names the current context (spec §2.9). */
export function ContextName(p: SwitcherProps) {
  const { name } = useCurrent(p);
  return <span className="truncate font-semibold">{name}</span>;
}

/**
 * Spec §2.4 / D4: the HighLevel-style context switcher at the top of the sidebar and the mobile drawer — a trigger
 * card (Platform / Agency / Client) and a popover with search, context links, Recent and All clients (pins first).
 * Hidden (static name) when the viewer has only one context and one client. `hotkey`: this instance answers
 * Cmd/Ctrl+K (the sidebar's, from `lg` up; the drawer's copy never does). `modal`: the drawer's copy — the Sheet is a
 * modal Radix Dialog whose scroll lock blocks wheel/touch outside it, and the popover portals out of it, so the list
 * could not scroll; a modal popover takes over the lock (the known combobox-in-dialog fix).
 */
export function ContextSwitcher({ hotkey = false, modal = false, ...p }: SwitcherProps & { hotkey?: boolean; modal?: boolean }) {
  const router = useRouter();
  const current = useCurrent(p);
  const { context, clientId } = current;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [pins, setPins] = useState<string[]>([]);
  const [, startTransition] = useTransition();
  const membershipId = p.currentMembershipId;
  const support = p.supportAgency;
  // Support sessions never touch the operator's storage (no pins, no recent).
  const storage = p.flags.isAgency && !support ? membershipId : null;
  const hidden = !p.flags.isPlatformOperator && !p.flags.isAgency && p.accounts.length <= 1;

  const show = useCallback((next: boolean) => {
    if (next && storage) {
      setRecent(readRecent(storage));
      setPins(readPins(storage));
    }
    if (!next) setQuery('');
    setOpen(next);
  }, [storage]);

  // "Recent" = the last clients opened, however they were opened (portfolio, links, this switcher).
  const known = clientId !== null && p.clients.some((c) => c.id === clientId);
  useEffect(() => {
    if (storage && context === 'client' && known && clientId) pushRecent(storage, clientId, p.clients.map((c) => c.id));
  }, [storage, context, known, clientId, p.clients]);

  useEffect(() => {
    if (!hotkey || hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      // The sidebar is hidden below `lg`; its popover would anchor to nothing there.
      if (typeof window.matchMedia === 'function' && !window.matchMedia('(min-width: 1024px)').matches) return;
      e.preventDefault();
      show(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey, hidden, show]);

  if (hidden) {
    return (
      <div className={CARD}>
        <Card current={current} interactive={false} />
      </div>
    );
  }

  const go = (href: string) => {
    show(false);
    router.push(href);
  };
  const switchTo = (id: string) => {
    show(false);
    const fd = new FormData();
    fd.set('membershipId', id);
    // The action sets the membership cookie and redirects to that membership's home ('/' → homePath).
    startTransition(async () => {
      await switchMembership(fd);
    });
  };
  const openClient = (id: string) => {
    if (storage) pushRecent(storage, id, p.clients.map((c) => c.id));
    go(`/c/${id}`);
  };

  const q = query.trim().toLowerCase();
  const platform = context === 'platform';
  const agencyRole = p.flags.isAgency;
  const listAccounts = !platform && !agencyRole && p.accounts.length > 1;
  const listClients = !platform && agencyRole;
  const ids = new Set(p.clients.map((c) => c.id));
  const pinned = pins.filter((id) => ids.has(id));
  const allClients = p.clients
    .filter((c) => !q || matches(q, c.name))
    .sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)) || byName(a, b));
  const recentClients = recent.filter((id) => ids.has(id)).slice(0, 5).map((id) => p.clients.find((c) => c.id === id)!);
  const agencies = [...p.ownAgencies].filter((a) => !q || matches(q, a.name)).sort(byName);
  const accounts = p.accounts.filter((a) => !q || matches(q, a.name, a.sub));

  const links: { label: string; icon: typeof Globe; run: () => void }[] = [];
  if (!q) {
    if (support) links.push({ label: 'Back to platform', icon: ArrowLeft, run: () => go(support.backHref) });
    else if (p.flags.isPlatformOperator && !platform) links.push({ label: 'Switch to Platform view', icon: Globe, run: () => go('/platform') });
    if (platform && p.ownAgencies.length > 0) {
      const own = p.ownAgencies.find((a) => a.membershipId === membershipId);
      links.push({ label: 'Switch to Agency view', icon: Building2, run: () => (own || agencyRole ? go('/agency') : switchTo(p.ownAgencies[0]!.membershipId)) });
    } else if (context === 'client' && agencyRole) {
      links.push({ label: 'Switch to Agency view', icon: Building2, run: () => go('/agency') });
    }
  }

  const clientRow = (c: SwitcherClient, group: 'recent' | 'all') => {
    const isPinned = pinned.includes(c.id);
    return (
      <CommandItem key={`${group}:${c.id}`} value={`${group}:${c.id}`} onSelect={() => openClient(c.id)} className="gap-2.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span data-name className="truncate">{c.name}</span>
          {c.sub && <span className="truncate text-xs text-muted-ink">{c.sub}</span>}
        </span>
        {group === 'all' && storage && (
          <button
            type="button"
            aria-pressed={isPinned}
            aria-label={`Pin ${c.name}`}
            onPointerDown={(e) => e.stopPropagation()}
            // cmdk selects the highlighted row on Enter at its root; a key on the pin button must only toggle the pin.
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setPins(togglePin(storage, c.id));
            }}
            className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-md hover:bg-muted-surface ${isPinned ? 'text-primary-soft-text' : 'text-muted-ink'}`}
          >
            <Pin aria-hidden className={`h-3.5 w-3.5 ${isPinned ? 'fill-current' : ''}`} />
          </button>
        )}
      </CommandItem>
    );
  };

  const nothing = (platform ? agencies.length === 0 : listAccounts ? accounts.length === 0 : allClients.length === 0) && q !== '';

  return (
    <Popover open={open} onOpenChange={show} modal={modal}>
      <PopoverTrigger asChild>
        <button type="button" aria-haspopup="dialog" className={`${CARD} hover:bg-muted-surface`}>
          <Card current={current} interactive />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <Command shouldFilter={false} loop>
          <CommandInput placeholder={platform ? 'Search agencies' : 'Search clients'} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-[360px]">
            {nothing && <div className="py-6 text-center text-sm text-muted-ink">{platform ? 'No agencies match.' : 'No clients match.'}</div>}
            {links.length > 0 && (
              <CommandGroup>
                {links.map((l) => (
                  <CommandItem key={l.label} value={`link:${l.label}`} onSelect={l.run}>
                    <l.icon aria-hidden />
                    {l.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {platform && agencies.length > 0 && (
              <CommandGroup heading="Your agencies">
                {agencies.map((a) => (
                  <CommandItem key={a.membershipId} value={`agency:${a.membershipId}`} onSelect={() => (a.membershipId === membershipId ? go('/agency') : switchTo(a.membershipId))}>
                    <span data-name className="truncate">{a.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {listAccounts && accounts.length > 0 && (
              <CommandGroup heading="Your accounts">
                {accounts.map((a) => (
                  <CommandItem key={a.membershipId} value={`account:${a.membershipId}`} onSelect={() => (a.membershipId === membershipId ? show(false) : switchTo(a.membershipId))}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span data-name className="truncate">{a.name}</span>
                      {a.sub && <span className="truncate text-xs text-muted-ink">{a.sub}</span>}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {listClients && !q && recentClients.length > 0 && (
              <CommandGroup heading="Recent">{recentClients.map((c) => clientRow(c, 'recent'))}</CommandGroup>
            )}
            {listClients && allClients.length > 0 && (
              <CommandGroup heading="All clients">{allClients.map((c) => clientRow(c, 'all'))}</CommandGroup>
            )}
            {listClients && !support && !q && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value="link:add-client" onSelect={() => go('/agency/clients/new')}>
                    <Plus aria-hidden />
                    Add client
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
