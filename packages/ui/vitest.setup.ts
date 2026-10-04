import { afterEach } from 'vitest';

// Globals are off (no `test.globals` in vitest.config.ts), so RTL does not
// auto-register its cleanup hook: do it ourselves or component tests leak
// DOM between cases. This setup file also runs for node-environment tests
// (e.g. theme.test.ts) where there is no `document`, so only import and run
// RTL's cleanup when a DOM is actually present.
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
