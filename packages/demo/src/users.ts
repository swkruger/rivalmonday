/** Spec §4.1 / §5.5: an undeliverable domain (RFC 2606 `.test`). */
export const DEMO_DOMAIN = 'demo.rivalmonday.test';
export const DEMO_OPERATOR_EMAIL = `operator@${DEMO_DOMAIN}`;
/** The link type (`t` claim) every demo sign-in link is signed with; the dev-panel sign-in accepts no other. */
export const DEMO_LINK_TARGET = 'notifications' as const;

export type DemoUserKey = 'operator' | 'admin' | 'member' | 'ownerLoneStar' | 'ownerBrazos' | 'ownerSetup';

export interface DemoUserSpec {
  key: DemoUserKey;
  email: string;
  name: string;
  role: 'agency_admin' | 'account_manager' | 'client_owner';
  client?: 'loneStar' | 'brazos' | 'setupPending';
  label: string;
}

export const DEMO_USERS: readonly DemoUserSpec[] = [
  // Deviation 10: an operator still needs a membership to sign in.
  { key: 'operator', email: DEMO_OPERATOR_EMAIL, name: 'Olivia Operator', role: 'account_manager', label: 'Platform operator' },
  { key: 'admin', email: `admin@${DEMO_DOMAIN}`, name: 'Avery Admin', role: 'agency_admin', label: 'Agency admin' },
  { key: 'member', email: `member@${DEMO_DOMAIN}`, name: 'Morgan Member', role: 'account_manager', label: 'Agency member' },
  { key: 'ownerLoneStar', email: `owner.lonestar@${DEMO_DOMAIN}`, name: 'Luis Ortega', role: 'client_owner', client: 'loneStar', label: 'Client owner — Lone Star Cooling' },
  { key: 'ownerBrazos', email: `owner.brazos@${DEMO_DOMAIN}`, name: 'Bea Navarro', role: 'client_owner', client: 'brazos', label: 'Client owner — Brazos Plumbing Co' },
  { key: 'ownerSetup', email: `owner.cedarcreek@${DEMO_DOMAIN}`, name: 'Camille Duarte', role: 'client_owner', client: 'setupPending', label: 'Client owner — Cedar Creek Plumbing (mid-setup)' },
];

export const isDemoEmail = (email: string): boolean => email.trim().toLowerCase().endsWith(`@${DEMO_DOMAIN}`);
