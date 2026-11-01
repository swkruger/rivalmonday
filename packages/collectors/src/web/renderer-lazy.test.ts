import { expect, it, vi } from 'vitest';

// The web app imports @cs/collectors for robots, geocoding and lookups but never renders. Playwright must stay unloaded
// there: on Vercel its browsers.json isn't traced, so a top-level import takes down every page that reaches the barrel.
vi.mock('playwright', () => {
  throw new Error('playwright was loaded at import time');
});

it('importing @cs/collectors does not load playwright', async () => {
  const collectors = await import('../index');
  expect(collectors.createPlaywrightRenderer).toBeTypeOf('function');
});
