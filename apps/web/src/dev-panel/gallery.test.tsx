// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dev-panel/gallery' }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'localhost:3000' }) }));
const { DevGallery } = await import('./gallery');

afterEach(cleanup);

describe('DevGallery (app-style § 3.8)', () => {
  it('carries the dev-panel marker, three theme wrappers, an ink button and the ink band', () => {
    const { container } = render(<DevGallery />);
    expect(container.querySelector('[data-rm-dev-panel="gallery"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-gallery-theme]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-variant="ink"]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('[data-slot="page-header-band"]')).not.toBeNull();
  });
});
