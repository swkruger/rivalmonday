import type { SetupState } from '@cs/tools';
import Link from 'next/link';

const CLIENT_STEPS = ['profile', 'search', 'competitors'] as const;
const counted = (s: string | undefined) => s === 'done' || s === 'skipped';

/**
 * Done-or-skipped step counts while the setup is open for this viewer; null when closed or absent. Staff count every step
 * (5, or 4 for prospects) while `open`; client roles count their own three steps while `clientOpen` (invite and billing
 * are staff steps). Shared by both client overviews.
 */
export function openSetupSteps(
  setup: { state: Pick<SetupState, 'open' | 'clientOpen' | 'steps' | 'totalSteps'> } | null,
  staff: boolean,
): { doneSteps: number; totalSteps: number } | null {
  if (!setup) return null;
  const { state } = setup;
  if (staff) return state.open ? { doneSteps: Object.values(state.steps).filter(counted).length, totalSteps: state.totalSteps } : null;
  return state.clientOpen ? { doneSteps: CLIENT_STEPS.filter((k) => counted(state.steps[k])).length, totalSteps: CLIENT_STEPS.length } : null;
}

/** Calm chip linking to the setup wizard while a client's setup is open (Phase 11a §7). Not forced: it only nudges. */
export function SetupBadge({ clientId, open, doneSteps, totalSteps }: { clientId: string; open: boolean; doneSteps: number; totalSteps: number }) {
  if (!open) return null;
  return (
    <Link
      href={`/c/${clientId}/setup`}
      className="inline-flex w-fit items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-primary-soft-text hover:underline"
    >
      Finish setup · {doneSteps} of {totalSteps}
    </Link>
  );
}
