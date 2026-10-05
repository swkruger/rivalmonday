import { isUuid, type Role, ROLES, ToolError } from '@cs/core';
import type { AgencyBranding, AlertMode } from '@cs/db';
import type { ServiceAreaInput } from '@cs/tools';

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

export interface ClientProfileFields {
  name: string;
  verticalId: string;
  services: string[];
  keywords: string[];
  serviceArea: ServiceAreaInput | null;
  placeId: string | null;
  timezone?: string;
}

const lines = (v: string) => v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const CENTER = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Range checks happen in the tool (`clientInputProblems`); this only reads the form. */
export function parseClientProfileForm(fd: FormData): ClientProfileFields | { error: string } {
  const center = str(fd, 'center');
  const radius = str(fd, 'radiusKm');
  const zips = str(fd, 'zips').split(/[\s,;]+/).filter(Boolean);
  let serviceArea: ServiceAreaInput | null = null;
  if (center || zips.length) {
    const m = CENTER.exec(center);
    if (!m) return { error: 'Enter the centre as "latitude, longitude" (e.g. 33.95, -84.33)' };
    const radiusKm = Number(radius);
    if (!radius || !Number.isFinite(radiusKm)) return { error: 'Enter the radius in kilometres' };
    const towns = lines(str(fd, 'towns'));
    serviceArea = { center: { lat: Number(m[1]), lng: Number(m[2]) }, radiusKm, zips, ...(towns.length ? { towns } : {}) };
  }
  const tz = str(fd, 'timezone');
  return {
    name: str(fd, 'name'), verticalId: str(fd, 'verticalId'), services: fd.getAll('services').map(String), keywords: lines(str(fd, 'keywords')),
    serviceArea, placeId: str(fd, 'placeId') || null, ...(tz ? { timezone: tz } : {}),
  };
}

export function toFormResult(e: unknown): FormResult {
  if (e instanceof ToolError && e.code !== 'internal') return { ok: false, error: e.code === 'invalid_input' ? e.message : 'Not found' };
  throw e;
}
