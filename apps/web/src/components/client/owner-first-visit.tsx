import type { AccessContext } from '@cs/core';
import type { SetupState } from '@cs/tools';
import { cookies } from 'next/headers';
import { themeForViewer } from '@/server/theme';
import type { Viewer } from '@/server/viewer';
import { OwnerPickCard, OwnerWelcome } from './owner-welcome';
import { welcomeLine } from './owner-welcome-copy';
import { welcomeCookieName } from './owner-welcome-cookie';

/** What the Overview already reads with `get_client_setup`; an owner gets it only while asked to pick. */
export type OwnerSetupRead = { state: Pick<SetupState, 'competitors'>; lookup?: { city: string | null } | null; competitorSuggestions?: { status: string }[] } | null;

const firstNameOf = (full: string) => full.trim().split(/\s+/)[0] || null;

/**
 * Spec 16 §7: a client owner's first visit. The welcome line (agency brand) shows while the starting point is still on its
 * way and until dismissed; the "Choose competitors" card shows while the agency waits on the owner's pick. Nothing for
 * agency staff or a client viewer. The cookie and setup are checked before the branding read, so a returning owner pays
 * nothing; the branding is the same per-request `themeForViewer` read the shell already made.
 */
export async function OwnerFirstVisit({
  clientId,
  ctx,
  viewer,
  setup,
  startingPending,
}: {
  clientId: string;
  ctx: Pick<AccessContext, 'role'>;
  viewer: Viewer;
  setup: OwnerSetupRead;
  /** The Overview's own `pendingStartingPoint(...) !== null`. */
  startingPending: boolean;
}) {
  if (ctx.role !== 'client_owner' || viewer.kind !== 'user') return null;
  const jar = await cookies();
  const showWelcome = startingPending && !jar.get(welcomeCookieName(clientId));
  const waiting = setup?.state.competitors === 'waiting_owner';
  if (!showWelcome && !waiting) return null;
  const { branding } = await themeForViewer(viewer);
  const open = setup?.competitorSuggestions?.filter((s) => s.status === 'suggested').length ?? 0;
  return (
    <>
      {showWelcome && <OwnerWelcome clientId={clientId} line={welcomeLine(firstNameOf(viewer.name), branding.displayName)} />}
      {waiting && <OwnerPickCard clientId={clientId} agency={branding.displayName} count={open} place={setup?.lookup?.city ?? null} />}
    </>
  );
}
