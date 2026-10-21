export const ROLES = ['agency_admin', 'account_manager', 'client_owner', 'client_viewer'] as const;
export type Role = (typeof ROLES)[number];

export const FEATURES = ['dashboard', 'ask', 'mcp', 'manage_competitors', 'alert_rules'] as const;
export type Feature = (typeof FEATURES)[number];

/** Phase 7a2: channels a platform plan can switch off for a whole agency (spec D13). */
export const PLAN_FEATURES = ['ask', 'mcp'] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export type Permission = 'read' | 'feedback' | 'manage' | 'agency';
export type ClientScope = 'all' | readonly string[];

export interface AccessContext {
  readonly agencyId: string;
  readonly userId: string;
  readonly role: Role;
  readonly clientScope: ClientScope;
  readonly features: ReadonlySet<Feature>;
  /** 7a2 D13: channels the agency's platform plan allows (every role). */
  readonly planFeatures: ReadonlySet<PlanFeature>;
  /** Set only for a platform operator's read-only support session. */
  readonly support?: SupportInfo;
}

export interface SupportInfo { readonly sessionId: string; readonly platformUserId: string }

export interface AccessContextInput {
  agencyId: string;
  userId: string;
  role: Role;
  clientScope: ClientScope;
  features: readonly Feature[];
  /** 7a2 decision 1: defaults to every plan feature; viewers always pass `planFeaturesFor()` explicitly. */
  planFeatures?: readonly PlanFeature[];
  support?: SupportInfo;
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
    planFeatures: new Set((input.planFeatures ?? PLAN_FEATURES).filter((f) => (PLAN_FEATURES as readonly string[]).includes(f))),
    ...(input.support ? { support: Object.freeze({ sessionId: input.support.sessionId, platformUserId: input.support.platformUserId }) } : {}),
  });
}

/** 7a2 decision 3: the same viewer pinned to one client — never a support session; keeps client and plan features. */
export function scopeToClient(ctx: AccessContext, clientId: string): AccessContext {
  return createAccessContext({
    agencyId: ctx.agencyId, userId: ctx.userId, role: ctx.role, clientScope: [clientId],
    features: [...ctx.features], planFeatures: [...ctx.planFeatures],
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

/** 5c-1 decision 2: agency roles bypass per-client flags (as the registry does); client roles need the flag. */
export function hasFeature(ctx: AccessContext, feature: Feature): boolean {
  return isAgencyRole(ctx.role) || ctx.features.has(feature);
}

/** 7a2 D13: a channel (Ask/MCP) is on only when the agency's plan includes it AND the role/client flag allows it. */
export function hasChannel(ctx: AccessContext, f: PlanFeature): boolean {
  return ctx.planFeatures.has(f) && hasFeature(ctx, f);
}

export function isClientRole(role: Role): boolean {
  return role === 'client_owner' || role === 'client_viewer';
}
