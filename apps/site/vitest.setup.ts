import { afterEach } from 'vitest';

// Globals are off, so RTL does not auto-register its cleanup hook: do it here, and only
// when a DOM exists (node-environment tests share this setup file).
afterEach(async () => {
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
