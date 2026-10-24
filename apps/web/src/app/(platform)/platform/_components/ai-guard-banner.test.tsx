// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
import { AiGuardBanner } from './ai-guard-banner';

afterEach(cleanup);
const region = () => screen.getByRole('region', { name: 'AI spend guard' });

describe('AiGuardBanner', () => {
  it('renders nothing when ok or unknown', () => {
    const { container, rerender } = render(<AiGuardBanner state={{ state: 'ok' }} />);
    expect(container.innerHTML).toBe('');
    rerender(<AiGuardBanner state={null} />);
    expect(container.innerHTML).toBe('');
  });
  it('C7 on warn, with the percentage above normal and the scope label', () => {
    render(<AiGuardBanner state={{ state: 'warn', scope: 'openrouter', observedUsd: 25, baselineUsd: 10 }} />);
    expect(region().textContent).toContain('AI spend is 150% above normal (OpenRouter).');
  });
  it('C8 on paused', () => {
    render(<AiGuardBanner state={{ state: 'paused', scope: 'total', observedUsd: 40, baselineUsd: 10 }} />);
    expect(region().textContent).toContain('All AI calls are paused after a spend spike (all providers). Queued work is waiting — reset on Health.');
    expect(screen.getByRole('link', { name: 'Open Health' }).getAttribute('href')).toBe('/platform/health');
  });
  it('copes with a missing baseline', () => {
    render(<AiGuardBanner state={{ state: 'warn', scope: 'anthropic' }} />);
    expect(region().textContent).toContain('AI spend is above normal (Anthropic).');
  });
});
