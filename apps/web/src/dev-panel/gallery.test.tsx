// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ value: 'localhost:3000' as string | null }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dev-panel/gallery' }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(host.value ? { host: host.value } : {}) }));
const { DevGallery, galleryAllowed } = await import('./gallery');

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  host.value = 'localhost:3000';
});

describe('DevGallery (app-style § 3.8)', () => {
  it('carries the dev-panel marker, three theme wrappers, an ink button and the ink band', () => {
    const { container } = render(<DevGallery />);
    expect(container.querySelector('[data-rm-dev-panel="gallery"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-gallery-theme]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-variant="ink"]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('[data-slot="page-header-band"]')).not.toBeNull();
  });

  it('themes the wrappers (default none, purple, near-ink) and shows both page headers', () => {
    const { container } = render(<DevGallery />);
    const [a, b, c] = Array.from(container.querySelectorAll<HTMLElement>('[data-gallery-theme]'));
    expect(a!.getAttribute('style')).toBeNull();
    expect(b!.getAttribute('style')).toContain('--primary');
    expect(c!.getAttribute('style')).toContain('--primary');
    expect(b!.getAttribute('style')).not.toBe(c!.getAttribute('style'));
    expect(container.querySelectorAll('[data-slot="page-title"]')).toHaveLength(6);
    expect(container.querySelectorAll('[data-slot="page-header-band"]')).toHaveLength(3);
  });
});

describe('galleryAllowed', () => {
  it('is true only for a local host with the dev panel on outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_PANEL', '1');
    expect(await galleryAllowed()).toBe(true);
    host.value = 'evil.example';
    expect(await galleryAllowed()).toBe(false);
    host.value = 'localhost:3000';
    vi.stubEnv('DEV_PANEL', '');
    expect(await galleryAllowed()).toBe(false);
    vi.stubEnv('DEV_PANEL', '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(await galleryAllowed()).toBe(false);
  });
});
