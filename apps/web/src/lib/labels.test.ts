import { AGENCY_KINDS, ALERT_STATUSES, BILLING_STATES, CATALOG_STATUSES, CLIENT_STATUSES, EVIDENCE_KINDS, TREND_REPORT_STATUSES, WEBHOOK_KINDS } from '@cs/db';
import { AGENCY_ONLY_TERMS } from './agency-only-terms';
import { ROLES } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { AGENCY_NOTICE_KIND, ALERT_STATUS, ASK_MESSAGE_STATUS, BILLING_EVENT_REASON, BILLING_STATE, HEALTH_STATUS, INVOICE_STATUS, KB_ARTICLE_STATUS, billingReasonLabel, CLIENT_AUDIENCE_MAPS, CLIENT_STATUS, EVIDENCE_KIND, LEAD_STATUS, MEMBERSHIP_ROLE, REPORT_STATUS, REVIEW_STATUS, WEBHOOK_KIND, labelFor } from './labels';

describe('labelFor', () => {
  it('falls back to sentence case with neutral tone', () => {
    expect(labelFor(BILLING_STATE, 'some_new_state')).toEqual({ label: 'Some new state', tone: 'neutral' });
    expect(labelFor(BILLING_STATE, 'past_due')).toEqual({ label: 'Payment overdue', tone: 'warning' });
  });
  it('of null, undefined or empty is an em dash', () => {
    for (const v of [null, undefined, '']) expect(labelFor(BILLING_STATE, v)).toEqual({ label: '—', tone: 'neutral' });
  });
});

describe('every enum value has a label', () => {
  it('every BILLING_STATES value', () => { for (const v of BILLING_STATES) expect(BILLING_STATE[v].label, v).toBeTruthy(); });
  it('every CLIENT_STATUSES value', () => { for (const v of CLIENT_STATUSES) expect(CLIENT_STATUS[v].label, v).toBeTruthy(); });
  it('every ROLES value', () => { for (const v of ROLES) expect(MEMBERSHIP_ROLE[v].label, v).toBeTruthy(); });
  it('every const-backed enum value', () => {
    for (const v of ALERT_STATUSES) expect(ALERT_STATUS[v].label, v).toBeTruthy();
    for (const v of EVIDENCE_KINDS) expect(EVIDENCE_KIND[v].label, v).toBeTruthy();
    for (const v of CATALOG_STATUSES) expect(REVIEW_STATUS[v].label, v).toBeTruthy();
    for (const v of WEBHOOK_KINDS) expect(WEBHOOK_KIND[v].label, v).toBeTruthy();
    for (const v of AGENCY_KINDS) expect(AGENCY_NOTICE_KIND[v].label, v).toBeTruthy();
    for (const v of TREND_REPORT_STATUSES) expect(REPORT_STATUS[v].label, v).toBeTruthy();
  });
  it('every HEALTH_STATUS / INVOICE_STATUS value labelled', () => {
    expect(['ok', 'warn', 'down'].map((v) => HEALTH_STATUS[v as 'ok'].label)).toEqual(['Working', 'Slow', 'Down']);
    expect(HEALTH_STATUS.warn.tone).toBe('warning');
    for (const v of ['draft', 'open', 'paid', 'uncollectible', 'void'] as const) expect(INVOICE_STATUS[v].label, v).toBeTruthy();
    for (const v of ['draft', 'published'] as const) expect(KB_ARTICLE_STATUS[v].label, v).toBeTruthy();
  });
  it('billing event reasons are plain words, with a prefix-free fallback', () => {
    for (const [k, v] of Object.entries(BILLING_EVENT_REASON)) { expect(v, k).not.toMatch(/[_:]/); }
    expect(billingReasonLabel('admin:end_pilot')).toBe('Pilot ended by staff');
    expect(billingReasonLabel('timer:something_new')).toBe('Something new');
  });
  it('the union-typed maps (checked by the compiler) still have entries', () => {
    for (const map of [LEAD_STATUS, ASK_MESSAGE_STATUS, REPORT_STATUS]) expect(Object.keys(map).length).toBeGreaterThan(2);
  });
  it('labels are non-empty, sentence case (no snake_case) and short', () => {
    for (const map of [HEALTH_STATUS, INVOICE_STATUS, KB_ARTICLE_STATUS, BILLING_STATE, CLIENT_STATUS, LEAD_STATUS, ALERT_STATUS, REVIEW_STATUS, REPORT_STATUS, ASK_MESSAGE_STATUS, EVIDENCE_KIND, WEBHOOK_KIND, AGENCY_NOTICE_KIND, MEMBERSHIP_ROLE] as Record<string, { label: string }>[])
      for (const [k, e] of Object.entries(map)) { expect(e.label, k).not.toMatch(/_/); expect(e.label.length, k).toBeLessThan(40); }
  });
});

describe('client-audience maps', () => {
  it('contain no agency-only terms', () => {
    for (const map of CLIENT_AUDIENCE_MAPS) for (const [k, e] of Object.entries(map)) expect(e.label, k).not.toMatch(AGENCY_ONLY_TERMS);
  });
});
