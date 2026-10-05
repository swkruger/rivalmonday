import { isUuid, type Role, ROLES, ToolError } from '@cs/core';
import type { AgencyBranding, AlertMode } from '@cs/db';

export type FormResult = { ok: true; message?: string } | { ok: false; error: string };
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export function parseInviteForm(fd: FormData): { email: string; role: Role; clientId: string | null; clientScope: string[] | null } | { error: string } {
  const role = str(fd, 'role');
  if (!(ROLES as readonly string[]).includes(role)) return { error: 'Choose a role' };
  const scope = fd.getAll('scope').map(String).filter(isUuid);
  return { email: str(fd, 'email'), role: role as Role, clientId: str(fd, 'clientId') || null, clientScope: role === 'account_manager' && scope.length ? scope : null };
}

/** The accent is not overridable (brand.md), so it has no form field. */
const BRANDING_FIELDS = ['displayName', 'logoUrl', 'primary', 'secondary', 'fromName', 'signOff'] as const;
export function parseBrandingForm(fd: FormData): AgencyBranding {
  const out: AgencyBranding = {};
  for (const k of BRANDING_FIELDS) {
    const v = str(fd, k);
    if (v) out[k] = v;
  }
  return out;
}

const MODES: AlertMode[] = ['direct', 'after_am_check', 'digest_only'];
export function parseDeliveryForm(fd: FormData): { alertMode: AlertMode; briefAutoSend: boolean; timezone?: string } | { error: string } {
  const mode = str(fd, 'alertMode');
  if (!MODES.includes(mode as AlertMode)) return { error: 'Choose an alert mode' };
  const tz = str(fd, 'timezone');
  return { alertMode: mode as AlertMode, briefAutoSend: fd.get('briefAutoSend') === 'on', ...(tz ? { timezone: tz } : {}) };
}

export function toFormResult(e: unknown): FormResult {
  if (e instanceof ToolError && e.code !== 'internal') return { ok: false, error: e.code === 'invalid_input' ? e.message : 'Not found' };
  throw e;
}
