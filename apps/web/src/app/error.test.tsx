// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const report = vi.hoisted(() => vi.fn());
vi.mock('@/lib/report-error', () => ({ reportError: report }));

const { default: RootError } = await import('./error');
const { default: AppError } = await import('./(app)/error');
const { default: PlatformError } = await import('./(platform)/platform/error');
const { default: GlobalError } = await import('./global-error');
const { default: NotFound, metadata } = await import('./not-found');

const err = Object.assign(new Error('boom detail'), { digest: 'dg1' });
beforeEach(() => report.mockClear());
afterEach(cleanup);

describe.each([['root', RootError], ['app', AppError], ['platform', PlatformError]] as const)('%s error.tsx', (_n, Boundary) => {
  it('error.tsx calls reportError once with page', () => {
    render(<Boundary error={err} reset={() => {}} />);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(err, 'page');
  });

  it('Try again calls reset', () => {
    const reset = vi.fn();
    render(<Boundary error={err} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reference: dg1')).toBeTruthy();
    expect(document.body.textContent).not.toContain('boom detail');
  });
});

describe('global-error', () => {
  it('global-error renders html and reports global', () => {
    const { container } = render(<GlobalError error={err} reset={() => {}} />, { container: document });
    expect(container).toBe(document);
    expect(report).toHaveBeenCalledWith(err, 'global');
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
  });
});

describe('not-found', () => {
  it('renders the 404 copy with an absolute neutral title', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(metadata.title).toEqual({ absolute: 'Page not found' });
  });
});
