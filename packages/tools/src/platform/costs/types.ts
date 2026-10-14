export type ServiceKey = 'openrouter' | 'dataforseo' | 'scrapecreators' | 'apify' | 'anthropic' | 'neon';

export type CostEnv = Partial<
  Record<
    | 'OPENROUTER_API_KEY'
    | 'DATAFORSEO_LOGIN'
    | 'DATAFORSEO_PASSWORD'
    | 'SCRAPECREATORS_API_KEY'
    | 'APIFY_TOKEN'
    | 'ANTHROPIC_ADMIN_KEY'
    | 'NEON_API_KEY'
    | 'NEON_ORG_ID',
    string
  >
>;

export interface CostReading {
  status: 'ok' | 'error' | 'unavailable' | 'not_configured';
  kind: 'balance' | 'usage';
  amountUsd?: number;
  units?: number;
  capUsd?: number;
  /** Short code only (HTTP 401, timeout, task 40201, bad response); never a vendor body. */
  error?: string;
}

export type CostAdapter = (env: CostEnv, fetchImpl: typeof fetch, now: Date) => Promise<CostReading>;

export const SERVICES: Record<ServiceKey, { label: string; kind: 'balance' | 'usage'; unit?: 'credits' | 'CU-hours' }> = {
  openrouter: { label: 'OpenRouter', kind: 'balance' },
  dataforseo: { label: 'DataForSEO', kind: 'balance' },
  scrapecreators: { label: 'ScrapeCreators', kind: 'balance', unit: 'credits' },
  apify: { label: 'Apify', kind: 'usage' },
  anthropic: { label: 'Anthropic', kind: 'usage' },
  neon: { label: 'Neon', kind: 'usage', unit: 'CU-hours' },
};
