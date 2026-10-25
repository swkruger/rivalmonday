import { formatMoney } from '@/lib/format';
import { PLAN_MOVE_REASON_LABEL } from '@/lib/labels';

/** One `list_plan_agencies` row (the fields the move UI shows). */
export interface PlanAgencyRow {
  agencyId: string;
  name: string;
  state: string;
  version: number | null;
  onHold: boolean;
  seatWarning: 'extra_seats' | 'over_cap' | null;
  extraSeatsAfter: number;
  monthlyNowCents: number;
  monthlyAfterCents: number;
}

export interface MoveResultData {
  targetPlanId: string;
  targetVersion: number;
  results: { agencyId: string; outcome: 'moved' | 'already_current' | 'refused' | 'failed'; reason?: keyof typeof PLAN_MOVE_REASON_LABEL; emailed: boolean }[];
}

export const MOVE_NOTE = "New prices start at each agency's next billing date. Feature changes apply now. Admins are emailed.";

/** P7 warning texts (spec §2). */
export function seatWarningText(row: Pick<PlanAgencyRow, 'seatWarning' | 'extraSeatsAfter'>): string | null {
  if (row.seatWarning === 'extra_seats') return `Pays for ${row.extraSeatsAfter} extra ${row.extraSeatsAfter === 1 ? 'seat' : 'seats'} from the next billing date.`;
  if (row.seatWarning === 'over_cap') return "Over the client limit: new clients can't be activated until they're under it.";
  return null;
}

export const versionText = (v: number | null) => (v === null ? 'Not set' : `v${v}`);
export const monthly = (cents: number) => formatMoney(cents, { unit: 'cents' });

/** The dialog body list: each agency's monthly price now → after, and its warning when it has one. */
export function MoveLines({ rows, targetVersion }: { rows: PlanAgencyRow[]; targetVersion: number }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const warning = seatWarningText(r);
          return (
            <li key={r.agencyId} className="text-sm text-ink">
              <span className="font-semibold">{r.name}</span>{' '}
              <span>({versionText(r.version)} → v{targetVersion}): {monthly(r.monthlyNowCents)} → {monthly(r.monthlyAfterCents)} a month</span>
              {warning && <span className="block text-xs text-muted-foreground">{warning}</span>}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">{MOVE_NOTE}</p>
    </div>
  );
}

/** "Moved {n}." plus, when some were refused or failed, "{m} not moved: {name} ({reason})". `already_current` is neither. */
export function moveSummary(data: MoveResultData, nameOf: (agencyId: string) => string): string {
  const moved = data.results.filter((r) => r.outcome === 'moved').length;
  const notMoved = data.results.filter((r) => r.outcome === 'refused' || r.outcome === 'failed');
  const list = notMoved.map((r) => `${nameOf(r.agencyId)} (${r.reason ? PLAN_MOVE_REASON_LABEL[r.reason] : 'Not moved'})`).join(', ');
  return `Moved ${moved}.${notMoved.length ? ` ${notMoved.length} not moved: ${list}` : ''}`;
}
