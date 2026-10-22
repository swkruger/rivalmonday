// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import AgencyLoading from '@/app/(app)/agency/loading';
import ClientLoading from '@/app/(app)/c/[clientId]/loading';
import InboxLoading from '@/app/(app)/inbox/loading';
import PlatformLoading from '@/app/(platform)/platform/loading';
import { PageSkeleton } from './page-skeleton';

afterEach(cleanup);

describe('PageSkeleton', () => {
  it('page skeleton announces Loading…', () => {
    render(<PageSkeleton />);
    expect(screen.getByRole('status').textContent).toContain('Loading…');
  });

  it('renders three cards by default', () => {
    const { container } = render(<PageSkeleton />);
    expect(container.querySelectorAll('[data-skeleton-card]').length).toBe(3);
  });

  it('renders the requested number of cards', () => {
    const { container } = render(<PageSkeleton cards={5} />);
    expect(container.querySelectorAll('[data-skeleton-card]').length).toBe(5);
  });
});

describe('loading.tsx files', () => {
  it.each([
    ['client', ClientLoading],
    ['agency', AgencyLoading],
    ['platform', PlatformLoading],
    ['inbox', InboxLoading],
  ])('each loading.tsx renders PageSkeleton (%s)', (_n, Loading) => {
    const { container } = render(<Loading />);
    expect(screen.getByRole('status').textContent).toContain('Loading…');
    expect(container.querySelectorAll('[data-skeleton-card]').length).toBe(3);
    cleanup();
  });
});
