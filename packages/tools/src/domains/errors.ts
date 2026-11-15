import { redactForLog } from '@cs/core/server';
import type { DnsRecord } from '@cs/db';

/** Phase 13a1 (P13): the agency's custom web hostname on the Vercel project. `records` = what the agency must create in DNS. */
export interface VercelDomainState { verified: boolean; misconfigured: boolean; records: DnsRecord[]; message: string | null }
export interface VercelDomains {
  add(hostname: string): Promise<VercelDomainState>;
  remove(hostname: string): Promise<void>;
  status(hostname: string): Promise<VercelDomainState>;
}
/** Phase 13a1: the agency's sending domain on the Postmark account. `id` = Postmark's integer domain id. */
export interface PostmarkDomainState { id: number; dkim: { host: string; value: string; verified: boolean }; returnPath: { host: string; value: string; verified: boolean } }
export interface PostmarkDomains {
  create(domain: string): Promise<PostmarkDomainState>;
  verifyDkim(id: number): Promise<PostmarkDomainState>;
  verifyReturnPath(id: number): Promise<PostmarkDomainState>;
  remove(id: number): Promise<void>;
}

export type DomainVendorErrorCode = 'in_use' | 'invalid' | 'unavailable';

/**
 * A vendor refusal or failure. `message` is log-safe: built only from the vendor name, method, path (no query string),
 * HTTP status and the vendor's error code; never a token, a URL query or the vendor's free-text message.
 */
export class DomainVendorError extends Error {
  constructor(public code: DomainVendorErrorCode, message: string) {
    super(redactForLog(message.replace(/\?\S*/g, '')) as string);
    this.name = 'DomainVendorError';
  }
}

/** A short, safe vendor error code (`[a-z0-9_]`, ≤ 64), else null. Vendor free text is never copied. */
export function safeCode(v: unknown): string | null {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  return /^[A-Za-z0-9_.-]{1,64}$/.test(s) ? s : null;
}

export const DOMAIN_VENDOR_TIMEOUT_MS = 10_000;
