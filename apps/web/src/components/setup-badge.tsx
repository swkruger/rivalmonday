import type { SetupState } from '@cs/tools';
import Link from 'next/link';

/** Settled steps (O12: `waiting_owner` counts, staff are done with it). */
const counted = (s: string | undefined) => s === 'done' || s === 'skipped' || s === 'waiting_owner';
const firstNameOf = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null;

export type SetupBadgeProps = { open: boolean; doneSteps: number; totalSteps: number; waitingOnOwner: { firstName: string | null } | null };

/**
 * Staff only (P8: owners never enter setup; their Overview card is separate). While the setup is open: settled steps
 * out of N = the steps + the All set screen ("Setup n of N"). Open or completed, while the owner was asked to pick and
 * hasn't: "Waiting on <first name>" (the invited owner's name when known). Null otherwise. Shared by both client overviews.
 */
export function openSetupSteps(
  setup: { state: Pick<SetupState, 'open' | 'steps' | 'totalSteps' | 'competitors'>; invite?: { name: string | null } } | null,
  staff: boolean,
): SetupBadgeProps | null {
  if (!setup || !staff) return null;
  const { state } = setup;
  const waiting = state.competitors === 'waiting_owner';
  if (!state.open && !waiting) return null;
  return {
    open: state.open, doneSteps: Object.values(state.steps).filter(counted).length, totalSteps: state.totalSteps + 1,
    waitingOnOwner: waiting ? { firstName: firstNameOf(setup.invite?.name) } : null,
  };
}

/** Calm chip linking to the setup wizard (Phase 11a §7, 16 O12). Not forced: it only nudges. */
export function SetupBadge({ clientId, open, doneSteps, totalSteps, waitingOnOwner }: { clientId: string } & SetupBadgeProps) {
  if (!open && !waitingOnOwner) return null;
  const waiting = waitingOnOwner ? `Waiting on ${waitingOnOwner.firstName ?? 'the owner'}` : null;
  const text = open ? `Setup ${doneSteps} of ${totalSteps}${waiting ? ` · ${waiting}` : ''}` : waiting;
  return (
    <Link
      href={`/c/${clientId}/setup`}
      className="inline-flex w-fit items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-primary-soft-text hover:underline"
    >
      {text}
    </Link>
  );
}
