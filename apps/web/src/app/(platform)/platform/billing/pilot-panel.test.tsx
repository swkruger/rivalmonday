// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';

vi.mock('./actions', () => ({ setPilotModeAction: async () => ({ ok: true }), setSampleLimitAction: async () => ({ ok: true }) }));
const { PilotPanel } = await import('./pilot-panel');
afterEach(cleanup);

describe('PilotPanel', () => {
  it('owner gets the switch and the limit field with its hints', () => {
    render(<PilotPanel pilotOn sampleLimit={7} canEdit />);
    expect(screen.getByRole('switch', { name: 'Pilot mode' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText('Sample briefs per month') as HTMLInputElement).value).toBe('7');
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    expect(screen.getByText('On: open agency sign-up is closed and the site shows the waitlist. Invite links keep working.')).toBeTruthy();
    expect(screen.getByText('Approvals beyond this number are refused until next month.')).toBeTruthy();
  });

  it('switch hidden for non-owners, who read the values', () => {
    render(<PilotPanel pilotOn={false} sampleLimit={10} canEdit={false} />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByText('off')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('a read-only support session hides the controls even for an owner', () => {
    render(<ReadOnlyProvider readOnly><PilotPanel pilotOn sampleLimit={10} canEdit /></ReadOnlyProvider>);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
