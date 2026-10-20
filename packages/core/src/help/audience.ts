import type { Role } from '../access';

export type HelpAudience = 'all' | 'agency' | 'client' | 'operator';
export type ViewerAudience = Exclude<HelpAudience, 'all'>;

/** Which `HelpAudience` values a viewer may see. Clients never get agency- or operator-only help. */
export function visibleAudiences(v: ViewerAudience): HelpAudience[] {
  if (v === 'client') return ['all', 'client'];
  if (v === 'agency') return ['all', 'agency'];
  return ['all', 'agency', 'operator'];
}

/** Platform context is always operator; agency roles see agency help; client roles and guests see client help. */
export function viewerAudience(role: Role | 'guest', context: 'platform' | 'agency' | 'client'): ViewerAudience {
  if (context === 'platform') return 'operator';
  return role === 'agency_admin' || role === 'account_manager' ? 'agency' : 'client';
}
