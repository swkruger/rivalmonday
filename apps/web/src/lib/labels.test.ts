import { BILLING_STATES, CLIENT_STATUSES } from '@cs/db';
import { ROLES } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { ALERT_STATUS, ASK_MESSAGE_STATUS, BILLING_STATE, CLIENT_AUDIENCE_MAPS, CLIENT_STATUS, EVIDENCE_KIND, LEAD_STATUS, MEMBERSHIP_ROLE, REPORT_STATUS, REVIEW_STATUS, WEBHOOK_KIND, labelFor } from './labels';

/** Agency/operator-only words that must never reach a client role. */
const AGENCY_ONLY_TERMS = /\b(rival monday|jev|verifier|upsell|tenant|pg-boss|openrouter|operator|platform fee)\b/i;

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
  it('the hand-typed maps cover their DB values', () => {
    expect(Object.keys(ALERT_STATUS).sort()).toEqual(['approved', 'delivered', 'dismissed', 'drafting', 'expired', 'pending_review', 'withdrawn']);
    expect(Object.keys(LEAD_STATUS).sort()).toEqual(['accepted', 'declined', 'expired', 'unverified', 'verified']);
    expect(Object.keys(REVIEW_STATUS).sort()).toEqual(['merged', 'reviewed', 'unreviewed']);
    expect(Object.keys(REPORT_STATUS).sort()).toEqual(['failed', 'ready', 'running', 'sent']);
    expect(Object.keys(ASK_MESSAGE_STATUS).sort()).toEqual(['cancelled', 'error', 'ok', 'quota', 'refused']);
    expect(Object.keys(EVIDENCE_KIND).sort()).toEqual(['html', 'screenshot', 'text', 'vendor_json']);
    expect(Object.keys(WEBHOOK_KIND).sort()).toEqual(['slack', 'teams']);
  });
  it('labels are non-empty, sentence case (no snake_case) and short', () => {
    for (const map of [BILLING_STATE, CLIENT_STATUS, LEAD_STATUS, ALERT_STATUS, REVIEW_STATUS, REPORT_STATUS, ASK_MESSAGE_STATUS, EVIDENCE_KIND, WEBHOOK_KIND, MEMBERSHIP_ROLE] as Record<string, { label: string }>[])
      for (const [k, e] of Object.entries(map)) { expect(e.label, k).not.toMatch(/_/); expect(e.label.length, k).toBeLessThan(40); }
  });
});

describe('client-audience maps', () => {
  it('contain no agency-only terms', () => {
    for (const map of CLIENT_AUDIENCE_MAPS) for (const [k, e] of Object.entries(map)) expect(e.label, k).not.toMatch(AGENCY_ONLY_TERMS);
  });
});
