import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', () => ({ usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }) }));
vi.mock('../join/join-provider', () => ({ useJoin: () => ({ open: () => {} }) }));
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test' } }));

import { HERO } from '../../../content/home';
import { FRIDAY_ANSWERS } from '../../../content/sample-friday';
import { SAMPLE } from '../../sample/schema';
import { Hero } from './hero';

beforeEach(() => {
  pilot.pilotMode = true;
});

describe('Hero', () => {
  it('renders the decided headline, eyebrow and sub exactly', () => {
    const { container } = render(<Hero />);
    const h1 = container.querySelector('h1')!;
    expect(h1.textContent).toBe(HERO.headline);
    const accent = h1.querySelector('[data-accent]')!;
    expect(accent.textContent).toBe(HERO.headlineAccent);
    expect(accent.className).toContain('text-secondary');
    expect(screen.getByText(HERO.eyebrow)).toBeTruthy();
    expect(screen.getByText(HERO.eyebrowPill)).toBeTruthy();
    expect(screen.getByText(HERO.sub)).toBeTruthy();
    expect(screen.getByText(HERO.finePrint)).toBeTruthy();
    expect(screen.getByRole('button', { name: HERO.primaryCta })).toBeTruthy();
  });

  it('fragments show data from SAMPLE and FRIDAY_ANSWERS', () => {
    const { container } = render(<Hero />);
    const frags = container.querySelector('[data-slot="hero-fragments"]')!;
    for (const item of SAMPLE.items.slice(0, 3)) expect(frags.textContent).toContain(item.headline);
    // The map card shows the latest scan over the sample town, with its top-3 count.
    const last = SAMPLE.rankGrid.weeks.at(-1)!.you;
    const top3 = last.filter((r) => r !== null && r <= 3).length;
    const points = last.filter((r) => r !== null).length;
    const map = frags.querySelector('[data-fragment="map"]')!;
    expect(map.querySelectorAll('[data-rank-cell]')).toHaveLength(SAMPLE.rankGrid.size ** 2);
    expect(map.textContent).toContain(`Top 3 in ${top3} of ${points} map points`);
    expect(map.querySelector('img')!.getAttribute('alt')).toBe('');
    expect(frags.textContent).toContain(FRIDAY_ANSWERS[0]!.question);
    expect(frags.textContent).toContain(FRIDAY_ANSWERS[0]!.answer[0]!.text);
    // Only the shown part is on screen, so only its cites count.
    const shown = FRIDAY_ANSWERS[0]!.answer[0]!;
    const n = shown.cite ? 1 : 0;
    expect(frags.querySelector('[data-slot="friday-sources"]')!.textContent).toBe(`${n} ${n === 1 ? 'source' : 'sources'}`);
  });

  it('fragments are aria-hidden with one visually hidden summary linking to the sample', () => {
    const { container } = render(<Hero />);
    expect(container.querySelector('[data-slot="hero-fragments"]')!.getAttribute('aria-hidden')).toBe('true');
    const summary = screen.getByText(/Preview of a sample Monday brief/);
    expect(summary.className).toContain('sr-only');
    expect(screen.getByText('Jump to the full sample').getAttribute('href')).toBe('#sample');
  });

  it('the sr-only jump link becomes visible on focus', () => {
    render(<Hero />);
    const link = screen.getByText('Jump to the full sample');
    expect(link.className).toContain('focus:not-sr-only');
    expect(link.parentElement!.closest('.sr-only')).toBeNull();
  });

  it('fine print follows pilot mode', () => {
    const { rerender } = render(<Hero />);
    expect(screen.getByText(HERO.finePrint)).toBeTruthy();
    pilot.pilotMode = false;
    rerender(<Hero />);
    expect(screen.queryByText(HERO.finePrint)).toBeNull();
    expect(screen.getByText(HERO.finePrintTrial)).toBeTruthy();
    expect(HERO.finePrintTrial).not.toMatch(/pilot/i);
  });

  it('secondary CTA is a text link to the client tour', () => {
    render(<Hero />);
    const link = screen.getByRole('link', { name: HERO.secondaryCta });
    expect(link.getAttribute('href')).toBe('#client-view');
    expect(link.className).not.toContain('border');
  });

  it('exactly one h1', () => {
    const { container } = render(<Hero />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('pilot pill hides when pilot is off', () => {
    const { rerender } = render(<Hero />);
    expect(screen.getByText(HERO.eyebrowPill)).toBeTruthy();
    pilot.pilotMode = false;
    rerender(<Hero />);
    expect(screen.queryByText(HERO.eyebrowPill)).toBeNull();
    expect(screen.getByText(HERO.eyebrow)).toBeTruthy();
  });

  it('site-owned classes survive in the DOM (text-display, shadow-float)', () => {
    const { container } = render(<Hero />);
    expect(container.querySelector('h1')!.className).toContain('text-display');
    const floats = container.querySelectorAll('[data-fragment]');
    expect(floats).toHaveLength(3);
    for (const f of floats) expect(f.className).toContain('shadow-float');
    expect(container.querySelector('.bg-grid-lines')).toBeTruthy();
    expect(container.querySelectorAll('.hero-wash')).toHaveLength(1);
  });

  it('shows no orange other than the pilot pill and the Friday badge', () => {
    const { container } = render(<Hero />);
    const amber = [...container.querySelectorAll('[class*="bg-amber"]')];
    expect(amber.map((e) => e.getAttribute('data-slot') ?? e.textContent).sort()).toEqual(['Pilot', 'friday-badge']);
  });
});
