/** Shapes returned by `list_platform_costs` (packages/tools/src/tools/platform-costs.ts), kept structural so client components need no server imports. */
export type ServiceStatus = 'ok' | 'low' | 'error' | 'unavailable' | 'not_configured' | 'disabled';

export interface CostService {
  service: string;
  label: string;
  kind: 'balance' | 'usage';
  unit: 'credits' | 'CU-hours' | null;
  status: ServiceStatus;
  amountUsd: number | null;
  units: number | null;
  capUsd: number | null;
  daysLeft: number | null;
  takenAt: string | null;
  error: string | null;
  billingUrl: string | null;
  lowThresholdUsd: number | null;
  warnDays: number;
  unitRateUsd: number | null;
  enabled: boolean;
}

export interface CostItem {
  id: string;
  name: string;
  kind: 'recurring' | 'one_off';
  amountUsd: number;
  period: 'monthly' | 'yearly' | null;
  monthlyUsd: number | null;
  startsOn: string;
  endsOn: string | null;
  billingUrl: string | null;
  notes: string | null;
}

export interface CostMonth { month: string; apiUsd: number; manualUsd: number }

export interface CostsData {
  services: CostService[];
  items: CostItem[];
  months: CostMonth[];
  summary: { mtdUsd: number; projectedMonthUsd: number; lowCount: number };
  refreshQueued: boolean;
}
