// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Alert } from './alert';

afterEach(cleanup);

describe('Alert', () => {
  it.each([
    ['info', 'status'],
    ['warning', 'status'],
    ['neutral', 'status'],
    ['danger', 'alert'],
  ] as const)('tone %s renders role=%s and data-tone', (tone, role) => {
    render(<Alert tone={tone}>Body</Alert>);
    const el = screen.getByRole(role);
    expect(el.getAttribute('data-tone')).toBe(tone);
    expect(el.getAttribute('data-slot')).toBe('alert');
    expect(el.textContent).toContain('Body');
  });

  it('renders the title', () => {
    render(<Alert tone="info" title="Heads up">Body</Alert>);
    expect(screen.getByText('Heads up')).toBeTruthy();
  });

  it('shows a default icon for non-neutral tones and none for neutral', () => {
    const { container, unmount } = render(<Alert tone="warning">Body</Alert>);
    expect(container.querySelector('svg')).not.toBeNull();
    unmount();
    const neutral = render(<Alert tone="neutral">Body</Alert>);
    expect(neutral.container.querySelector('svg')).toBeNull();
  });

  it('suppresses the icon with icon={null}', () => {
    const { container } = render(<Alert tone="danger" icon={null}>Body</Alert>);
    expect(container.querySelector('svg')).toBeNull();
  });
});
