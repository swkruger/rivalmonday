import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENCY_HOST_ROUTES, appRoutes, fillRoute, routeParams } from './agency-routes';

const APP = resolve(import.meta.dirname, '../src/app');

describe('agency host route table', () => {
  it('every app route is classified', () => {
    const routes = appRoutes(APP);
    expect(routes.length).toBeGreaterThan(80);
    expect(routes.filter((r) => !(r in AGENCY_HOST_ROUTES)), 'add these routes to AGENCY_HOST_ROUTES').toEqual([]);
    expect(Object.keys(AGENCY_HOST_ROUTES).filter((r) => !routes.includes(r)), 'these table entries are not app routes').toEqual([]);
  });

  it('fills every dynamic segment of every route and refuses an unknown one', () => {
    const p = { briefId: 'b', alertId: 'a', reportId: 'r', competitorId: 'k', evidenceId: 'e', threadId: 't', kbId: 'kb', intakeSlug: 's' };
    const params = routeParams('c1', p);
    for (const route of appRoutes(APP)) expect(fillRoute(route, params), route).not.toMatch(/[[\]]/);
    expect(fillRoute('/c/[clientId]/ask/[threadId]', params)).toBe('/c/c1/ask/t');
    expect(() => fillRoute('/x/[nope]', params)).toThrow(/no value for \[nope\]/);
    expect(() => fillRoute('/x/[client_id]/[id2]', params)).toThrow(/no value for \[client_id\]/);
    expect(() => fillRoute('/x/[id2]', params)).toThrow(/no value for \[id2\]/);
  });
});
