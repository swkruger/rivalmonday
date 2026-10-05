// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const endSession = vi.fn(async () => undefined);
vi.mock('@/app/(app)/actions', () => ({ endSession }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { GuestSignOutButton } = await import('./guest-sign-out-button');

beforeEach(() => vi.clearAllMocks());

describe('GuestSignOutButton', () => {
  it('clears the guest session and navigates to /sign-in without calling authClient (Important I1)', async () => {
    render(<GuestSignOutButton />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'));
    expect(endSession).toHaveBeenCalledTimes(1);
  });
});
