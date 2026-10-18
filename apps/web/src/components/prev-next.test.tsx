// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PrevNext } from './prev-next';

afterEach(cleanup);

describe('PrevNext', () => {
  it('renders both links with their hrefs', () => {
    render(<PrevNext previous="/p" next="/n" />);
    expect(screen.getByRole('link', { name: '‹ Previous' }).getAttribute('href')).toBe('/p');
    expect(screen.getByRole('link', { name: 'Next ›' }).getAttribute('href')).toBe('/n');
  });

  it('hides the missing link at either end', () => {
    render(<PrevNext previous={null} next="/n" />);
    expect(screen.queryByRole('link', { name: '‹ Previous' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Next ›' })).toBeTruthy();
  });

  it('renders nothing when there is no neighbour', () => {
    const { container } = render(<PrevNext previous={null} next={null} />);
    expect(container.innerHTML).toBe('');
  });
});
