import { createHash } from 'node:crypto';

/** Audit input hash: sha256 of `JSON.stringify(value ?? null)` (registry `audit_log` rows and platform audit rows). */
export function hashInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}
