import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TESTIMONIALS } from '../../../content/testimonials';
import { Testimonials } from './testimonials';

describe('Testimonials', () => {
  it('ships empty: quotes are never invented', () => {
    expect(TESTIMONIALS).toHaveLength(0);
    const { container } = render(<Testimonials />);
    expect(container.innerHTML).toBe('');
  });

  it('renders each quote with its attribution once there are some', () => {
    render(<Testimonials items={[{ quote: 'Q', name: 'N', role: 'R', agency: 'A' }]} />);
    expect(screen.getByRole('region', { name: 'What agencies say' })).toBeTruthy();
    expect(screen.getByText('“Q”')).toBeTruthy();
  });
});
