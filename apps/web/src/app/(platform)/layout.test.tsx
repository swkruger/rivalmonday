// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ requireContext: vi.fn(), requireOperatorContext: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: m.requireContext, requireOperatorContext: m.requireOperatorContext }));
vi.mock('@/components/shell/app-shell', () => ({
  AppShell: ({ viewer, children }: { viewer: { kind: string }; children: React.ReactNode }) => (
    <div data-testid="shell" data-kind={viewer.kind}>
      {children}
    </div>
  ),
}));
const { default: PlatformLayout } = await import('./layout');
const { default: AppLayout } = await import('../(app)/layout');

beforeEach(() => {
  m.requireContext.mockReset().mockResolvedValue({ viewer: { kind: 'support' }, ctx: { support: {} } });
  m.requireOperatorContext.mockReset().mockResolvedValue({ viewer: { kind: 'user' }, ctx: {} });
});

describe('route-group layouts (Phase 8b M5)', () => {
  it('/platform/** renders the operator own context and never resolves the support context', async () => {
    render(await PlatformLayout({ children: <p>page</p> }));
    expect(m.requireOperatorContext).toHaveBeenCalledTimes(1);
    expect(m.requireContext).not.toHaveBeenCalled();
    expect(screen.getByTestId('shell').dataset.kind).toBe('user');
  });

  it('/agency and /c pages render the (support) context from requireContext', async () => {
    render(await AppLayout({ children: <p>page</p> }));
    expect(m.requireContext).toHaveBeenCalledTimes(1);
    expect(m.requireOperatorContext).not.toHaveBeenCalled();
    expect(screen.getByTestId('shell').dataset.kind).toBe('support');
  });
});
