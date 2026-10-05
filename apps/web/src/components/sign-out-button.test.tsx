// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn(async () => ({ data: null, error: null }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut } }));

const endSession = vi.fn(async () => undefined);
vi.mock('@/app/(app)/actions', () => ({ endSession }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { SignOutButton } = await import('./sign-out-button');

beforeEach(() => vi.clearAllMocks());

describe('SignOutButton', () => {
  it('ends the Better Auth session and the guest/membership-pick cookies, then navigates to /sign-in (Important I1)', async () => {
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in'));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(endSession).toHaveBeenCalledTimes(1);
  });
});
