// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Own file: React attaches its event listeners to `document` only for the first root that touches it, so a
// document-container render after any other render in the same file never receives clicks.
const report = vi.hoisted(() => vi.fn());
vi.mock('@/lib/report-error', () => ({ reportError: report }));

const { default: GlobalError } = await import('./global-error');

const err = Object.assign(new Error('boom detail'), { digest: 'dg1' });
beforeEach(() => report.mockClear());
afterEach(cleanup);

describe('global-error', () => {
  it('global-error renders html, reports global, and Try again calls retry', () => {
    const retry = vi.fn();
    const { container } = render(<GlobalError error={err} retry={retry} reset={() => {}} />, { container: document });
    expect(container).toBe(document);
    expect(report).toHaveBeenCalledWith(err, 'global');
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

