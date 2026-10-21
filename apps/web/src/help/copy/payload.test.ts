import { GLOSSARY } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { AGENCY_ONLY_CLIENT_KEYS } from '../reach';
import { PAGE_COPY, type PageKey } from '.';
import { helpCopyFor } from './payload';

/** Final review I1: the payload the shell hands to client components holds only what this viewer audience may read. */
describe('helpCopyFor', () => {
  const entries = (a: Parameters<typeof helpCopyFor>[0]) => {
    const c = helpCopyFor(a);
    return [...Object.entries(c.tips), ...Object.entries(c.empty)];
  };

  it('a client viewer gets no agency or operator entries and no agency or platform page copy', () => {
    const c = helpCopyFor('client');
    for (const [key, e] of entries('client')) {
      expect(e.audience ?? 'all', key).not.toMatch(/^(agency|operator)$/);
      expect(key, key).not.toMatch(/^(agency|platform)\./);
    }
    for (const t of c.terms) expect(t.audience, t.id).not.toMatch(/^(agency|operator)$/);
    expect(JSON.stringify(c)).not.toMatch(/"platform\.|"agency\./);
    for (const page of AGENCY_ONLY_CLIENT_KEYS) expect(Object.keys(c.tips).some((k) => k.startsWith(`${page}.`)), page).toBe(false);
    expect(Object.keys(helpCopyFor('agency').tips).some((k) => k.startsWith('client.settings.delivery.'))).toBe(true);
    expect(c.tips['client.overview.changesWeek']?.title).toBe(PAGE_COPY['client.overview'].tips.changesWeek.title);
  });

  it('an agency viewer gets agency and client page copy, never operator or client-audience entries', () => {
    const keys = entries('agency').map(([k]) => k);
    for (const [key, e] of entries('agency')) expect(e.audience ?? 'all', key).not.toMatch(/^(client|operator)$/);
    expect(keys.some((k) => k.startsWith('platform.'))).toBe(false);
    expect(keys.some((k) => k.startsWith('agency.'))).toBe(true);
    expect(keys.some((k) => k.startsWith('client.'))).toBe(true);
  });

  it('an operator gets the platform copy', () => {
    expect(entries('operator').some(([k]) => k.startsWith('platform.'))).toBe(true);
    expect(helpCopyFor('operator').terms.length).toBe(GLOSSARY.filter((t) => t.audience !== 'client').length);
  });

  it('every visible tip and empty state is keyed `<page key>.<id>` with its text unchanged', () => {
    const c = helpCopyFor('operator');
    for (const page of Object.keys(PAGE_COPY) as PageKey[]) {
      const copy: { tips?: Record<string, { title: string }>; empty?: Record<string, { title: string; audience?: string }> } = PAGE_COPY[page];
      for (const [id, t] of Object.entries(copy.tips ?? {})) if ((t as { audience?: string }).audience !== 'client') expect(c.tips[`${page}.${id}`]?.title).toBe(t.title);
      for (const [id, e] of Object.entries(copy.empty ?? {})) if (e.audience !== 'client') expect(c.empty[`${page}.${id}`]?.title).toBe(e.title);
    }
  });
});
