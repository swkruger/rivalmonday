import { describe, expect, it } from 'vitest';
import { billingRedirectFor } from './billing-redirect';

const BILLING = '/agency/settings/billing';

describe('billingRedirectFor (ruling R20)', () => {
  it('never redirects unless the agency is suspended (except /paused, which leaves)', () => {
    for (const state of ['pilot', 'trialing', 'active', 'past_due', 'read_only', 'cancelled'] as const) {
      expect(billingRedirectFor({ state, role: 'agency_admin', pathname: '/agency' })).toBeNull();
      expect(billingRedirectFor({ state, role: 'client_owner', pathname: '/c/x' })).toBeNull();
      expect(billingRedirectFor({ state, role: 'client_owner', pathname: '/paused' })).toBe('/');
    }
  });

  it('sends a suspended agency admin to billing, except on the billing page, its CSV and actions', () => {
    expect(billingRedirectFor({ state: 'suspended', role: 'agency_admin', pathname: '/agency' })).toBe(BILLING);
    expect(billingRedirectFor({ state: 'suspended', role: 'agency_admin', pathname: '/c/abc/competitors' })).toBe(BILLING);
    expect(billingRedirectFor({ state: 'suspended', role: 'agency_admin', pathname: BILLING })).toBeNull();
    expect(billingRedirectFor({ state: 'suspended', role: 'agency_admin', pathname: `${BILLING}/seats.csv` })).toBeNull();
    expect(billingRedirectFor({ state: 'suspended', role: 'agency_admin', pathname: '/agency/settings/billingx' })).toBe(BILLING);
  });

  it('sends a suspended account manager and every client role to /paused, and leaves /paused alone (no loop)', () => {
    for (const role of ['account_manager', 'client_owner', 'client_viewer'] as const) {
      expect(billingRedirectFor({ state: 'suspended', role, pathname: '/agency' })).toBe('/paused');
      expect(billingRedirectFor({ state: 'suspended', role, pathname: '/paused' })).toBeNull();
    }
  });

  it('does not redirect an admin when the path is unknown (no loop risk)', () => {
    expect(billingRedirectFor({ state: 'suspended', role: 'agency_admin', pathname: '' })).toBeNull();
  });
});
