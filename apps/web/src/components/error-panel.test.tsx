// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorPanel } from './error-panel';

afterEach(cleanup);

describe('ErrorPanel', () => {
  it('not_found copy', () => {
    render(<ErrorPanel kind="not_found" digest="abc" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page not found');
    expect(screen.getByText("This page doesn't exist or you don't have access to it.")).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to your home page' }).getAttribute('href')).toBe('/');
    expect(screen.queryByText(/Reference/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('error shows reference digest and never the message', () => {
    const onRetry = vi.fn();
    const error = Object.assign(new Error('secret db detail'), { digest: 'd1g3st' });
    const { container } = render(<ErrorPanel kind="error" digest={error.digest} onRetry={onRetry} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Something went wrong');
    expect(screen.getByText('Please try again in a moment.')).toBeTruthy();
    expect(screen.getByText('Reference: d1g3st')).toBeTruthy();
    expect(container.textContent).not.toContain('secret db detail');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Go to your home page' })).toBeTruthy();
  });

  it('error without a digest has no reference line', () => {
    render(<ErrorPanel kind="error" />);
    expect(screen.queryByText(/Reference/)).toBeNull();
  });
});
