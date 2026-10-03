export const ROLES = ['agency_admin', 'account_manager', 'client_owner', 'client_viewer'] as const;
export type Role = (typeof ROLES)[number];

export const FEATURES = ['dashboard', 'ask', 'mcp', 'manage_competitors', 'alert_rules'] as const;
export type Feature = (typeof FEATURES)[number];

export type Permission = 'read' | 'feedback' | 'manage' | 'agency';
export type ClientScope = 'all' | readonly string[];

export interface AccessContext {
  readonly agencyId: string;
  readonly userId: string;
  readonly role: Role;
  readonly clientScope: ClientScope;
  readonly features: ReadonlySet<Feature>;
}

export interface AccessContextInput {
  agencyId: string;
  userId: string;
  role: Role;
  clientScope: ClientScope;
  features: readonly Feature[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  agency_admin: ['read', 'feedback', 'manage', 'agency'],
  account_manager: ['read', 'feedback', 'manage', 'agency'],
  client_owner: ['read', 'feedback', 'manage'],
  client_viewer: ['read'],
};

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export function isAgencyRole(role: Role): boolean {
  return role === 'agency_admin' || role === 'account_manager';
}

export function createAccessContext(input: AccessContextInput): AccessContext {
  if (!isUuid(input.agencyId)) throw new Error('Invalid agencyId');
  if (!input.userId) throw new Error('Invalid userId');
  if (input.clientScope === 'all') {
    if (!isAgencyRole(input.role)) throw new Error('Client roles must be scoped to a client');
  } else {
    if (input.clientScope.length === 0 || !input.clientScope.every(isUuid)) {
      throw new Error('Invalid clientScope');
    }
    if (!isAgencyRole(input.role) && input.clientScope.length !== 1) {
      throw new Error('Client roles must be scoped to exactly one client');
    }
  }
  return Object.freeze({
    agencyId: input.agencyId,
    userId: input.userId,
    role: input.role,
    clientScope: input.clientScope === 'all' ? 'all' : Object.freeze([...input.clientScope]),
    features: new Set(input.features),
  });
}

export function hasPermission(ctx: AccessContext, permission: Permission): boolean {
  return ROLE_PERMISSIONS[ctx.role].includes(permission);
}

export function canAccessClient(ctx: AccessContext, clientId: string): boolean {
  return ctx.clientScope === 'all' || ctx.clientScope.includes(clientId);
}

/** Spec §3: account managers and admins manage competitors; a client owner only with the manage_competitors feature. */
export function canManageCompetitors(ctx: AccessContext): boolean {
  if (isAgencyRole(ctx.role)) return true;
  return hasPermission(ctx, 'manage') && ctx.features.has('manage_competitors');
}
