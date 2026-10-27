// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Highlight } from './highlight';
import { OnboardingShell } from './onboarding-shell';
import { PreviewWindow } from './preview-window';
import { StepFooter } from './step-footer';

vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/onboarding' }));

afterEach(cleanup);

describe('OnboardingShell (16 L7)', () => {
  it('renders step label and progressbar values', () => {
    render(<OnboardingShell brand={{ kind: 'platform' }} step={{ n: 2, of: 4, label: 'Your team' }} title="Invite your team">form</OnboardingShell>);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuemax')).toBe('4');
    expect(screen.getByText('Step 2 of 4 · Your team')).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Invite your team']);
    // Segments: the first two are `primary`, the rest `panel`.
    const segs = [...bar.children];
    expect(segs).toHaveLength(4);
    expect(segs.map((s) => s.className.includes('bg-primary'))).toEqual([true, true, false, false]);
  });

  it('hides preview below lg via class', () => {
    render(<OnboardingShell brand={{ kind: 'neutral' }} title="T" preview={<p>preview body</p>} caption="Looks like this">form</OnboardingShell>);
    const aside = screen.getByRole('complementary', { name: 'Preview' });
    expect(aside.className).toContain('hidden');
    expect(aside.className).toContain('lg:flex');
    expect(within(aside).getByText('preview body')).toBeTruthy();
    expect(within(aside).getByText('Looks like this')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('wide drops the preview panel and the 440px form cap', () => {
    render(<OnboardingShell brand={{ kind: 'neutral' }} title="T" wide preview={<p>nope</p>}>body</OnboardingShell>);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('nope')).toBeNull();
    expect(screen.getByText('body').className).not.toContain('max-w-[440px]');
  });

  it('renders agency logo when brand.kind=agency (and name, wordmark, nothing for the others)', () => {
    const { container, rerender } = render(<OnboardingShell brand={{ kind: 'agency', name: 'Acme', logoUrl: 'https://cdn.example.com/a.png', style: { '--primary': '#aa0000' } as React.CSSProperties }} title="T">x</OnboardingShell>);
    expect(screen.getByRole('img', { name: 'Acme' }).getAttribute('src')).toBe('https://cdn.example.com/a.png');
    expect(container.textContent).not.toContain('rivalmonday');
    rerender(<OnboardingShell brand={{ kind: 'agency', name: 'Acme', logoUrl: null, style: {} }} title="T">x</OnboardingShell>);
    expect(screen.getByText('Acme')).toBeTruthy();
    rerender(<OnboardingShell brand={{ kind: 'platform' }} title="T">x</OnboardingShell>);
    expect(container.textContent).toContain('rivalmonday');
    rerender(<OnboardingShell brand={{ kind: 'neutral' }} title="T">x</OnboardingShell>);
    expect(container.textContent).not.toContain('rival');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('shows the exit link only when given', () => {
    const { rerender } = render(<OnboardingShell brand={{ kind: 'neutral' }} title="T" exit={{ href: '/agency', label: 'Save and exit' }}>x</OnboardingShell>);
    expect(screen.getByRole('link', { name: 'Save and exit' }).getAttribute('href')).toBe('/agency');
    rerender(<OnboardingShell brand={{ kind: 'neutral' }} title="T" exit={null}>x</OnboardingShell>);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders page guide for helpKey', async () => {
    const { rerender } = render(<OnboardingShell brand={{ kind: 'neutral' }} title="Set up" helpKey="page:account.onboarding" guide>x</OnboardingShell>);
    expect(await screen.findByRole('button', { name: /guide/i }, { timeout: 8000 })).toBeTruthy();
    rerender(<OnboardingShell brand={{ kind: 'neutral' }} title="Set up" helpKey="page:account.onboarding">x</OnboardingShell>);
    expect(screen.queryByRole('button', { name: /guide/i })).toBeNull();
  });
});

describe('StepFooter', () => {
  it('footer omits Skip when not given, shows it when given', () => {
    const onSkip = vi.fn();
    const { rerender } = render(<StepFooter primary={{ label: 'Continue' }} />);
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' }).getAttribute('type')).toBe('submit');
    rerender(<StepFooter primary={{ label: 'Continue', form: 'f1', pending: true }} skip={{ label: 'Skip for now', onSkip }} back={() => {}} />);
    screen.getByRole('button', { name: 'Skip for now' }).click();
    expect(onSkip).toHaveBeenCalled();
    const primary = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(primary.getAttribute('form')).toBe('f1');
    expect(primary.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('Back as a string is a link', () => {
    render(<StepFooter primary={{ label: 'Next' }} back="/onboarding?step=profile" />);
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/onboarding?step=profile');
  });
});

describe('PreviewWindow and Highlight', () => {
  it('draws browser chrome by default and omits it when chrome=false', () => {
    const { container, rerender } = render(<PreviewWindow width={420}>body</PreviewWindow>);
    expect(container.querySelector('[data-chrome]')).not.toBeNull();
    rerender(<PreviewWindow chrome={false}>body</PreviewWindow>);
    expect(container.querySelector('[data-chrome]')).toBeNull();
    rerender(<PreviewWindow chrome="acme.example">body</PreviewWindow>);
    expect(screen.getByText('acme.example')).toBeTruthy();
  });

  it('Highlight outlines only when active', () => {
    const { container, rerender } = render(<Highlight active>x</Highlight>);
    expect(container.firstElementChild!.className).toContain('outline-dashed');
    rerender(<Highlight active={false}>x</Highlight>);
    expect(container.firstElementChild!.className).not.toContain('outline-dashed');
  });
});
