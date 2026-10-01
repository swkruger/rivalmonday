import { capture, trackedPage } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderedPage, Renderer } from '../web/renderer';
import { capturePage } from './capture-page';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const PAGE = '00000000-0000-4000-8000-0000000000e1';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.insert(trackedPage).values({ id: PAGE, competitorId: IDS.competitorX, url: 'https://s.example/pricing', pageType: 'pricing', source: 'nav', cadence: 'daily' });
});

describe('capturePage', () => {
  it('renders the tracked page, records the capture and closes the page', async () => {
    const close = vi.fn(async () => {});
    const page: RenderedPage = {
      requestedUrl: 'https://s.example/pricing', finalUrl: 'https://s.example/pricing', httpStatus: 200, status: 'ok', title: 'P',
      html: '<p>$99</p>', text: '$99', links: [], error: null, screenshot: async () => new Uint8Array([1]), close,
    };
    const renderer: Renderer = { render: vi.fn(async () => page), close: async () => {} };
    expect(await capturePage({ db: dbs.service, store: createMemoryStore(), renderer }, PAGE)).toEqual({ status: 'ok' });
    expect(renderer.render).toHaveBeenCalledWith('https://s.example/pricing');
    expect(close).toHaveBeenCalled();
    expect(await dbs.service.select().from(capture)).toHaveLength(1);
  });

  it('skips missing pages', async () => {
    const renderer: Renderer = { render: vi.fn(), close: async () => {} };
    expect(await capturePage({ db: dbs.service, store: createMemoryStore(), renderer }, '00000000-0000-4000-8000-000000000000')).toEqual({ status: 'missing' });
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
