// @vitest-environment jsdom
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

function findLoading(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? findLoading(join(dir, e.name)) : e.name === 'loading.tsx' ? [join(dir, e.name)] : [],
  );
}

describe('no route-level loading.tsx', () => {
  // A route loading.tsx makes Next stream the shell (HTTP 200) before the page runs, so a page's notFound() refusal
  // would arrive as 200 instead of 404 ("page refusals -> 404", binding). Use <Suspense fallback={<PageSkeleton />}>
  // inside the page, after its access checks, instead.
  it('no loading.tsx under app/(app) or app/(platform)', () => {
    const app = join(__dirname, '..', 'app');
    expect([...findLoading(join(app, '(app)')), ...findLoading(join(app, '(platform)'))]).toEqual([]);
  });
});
