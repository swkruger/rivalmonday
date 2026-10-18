// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));
const { InboxBell } = await import('./inbox-bell');

describe('InboxBell (spec §2.9)', () => {
  it('shows the unread count, capped at 9+, with the full count in the label', () => {
    const { unmount } = render(<InboxBell unread={3} />);
    expect(screen.getByRole('link', { name: 'Inbox, 3 unread' }).textContent).toBe('3');
    unmount();
    render(<InboxBell unread={12} />);
    expect(screen.getByRole('link', { name: 'Inbox, 12 unread' }).textContent).toBe('9+');
  });

  it('shows no badge at zero', () => {
    render(<InboxBell unread={0} />);
    expect(screen.getByRole('link', { name: 'Inbox, 0 unread' }).textContent).toBe('');
  });
});
