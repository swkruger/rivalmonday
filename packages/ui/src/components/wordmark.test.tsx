// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FridayBadge } from './friday-badge';
import { Wordmark } from './wordmark';

describe('Wordmark', () => {
  it('renders the two-colour rivalmonday wordmark by default', () => {
    const { container } = render(<Wordmark />);
    expect(container.textContent).toBe('rivalmonday');
    expect(container.querySelector('[data-part="rival"]')).not.toBeNull();
  });
  it('renders an agency display name instead when given', () => {
    render(<Wordmark name="Acme Marketing" />);
    expect(screen.getByText('Acme Marketing')).toBeTruthy();
  });
});

describe('FridayBadge', () => {
  it('shows the assistant name', () => {
    render(<FridayBadge name="Max" />);
    expect(screen.getByText('Max')).toBeTruthy();
  });
});
