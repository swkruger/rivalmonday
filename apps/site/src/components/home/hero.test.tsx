import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', () => ({ usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }) }));
const join = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../join/join-provider', () => ({ useJoin: () => join }));
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test' } }));

import { HERO, HOME_IMAGES } from '../../../content/home';
import { Hero } from './hero';

beforeEach(() => {
  pilot.pilotMode = true;
  join.open.mockClear();
});

describe('Hero', () => {
  it('headline is the decided lead and mark in one h1', () => {
    const { container } = render(<Hero />);
    const h1 = container.querySelector('h1')!;
    expect(h1.textContent).toBe('Tell every client what their rivals did this week.');
    expect(h1.textContent).toBe(`${HERO.headline.lead} ${HERO.headline.mark}`);
    const mark = [...h1.querySelectorAll('span')].find((e) => e.textContent === 'this week.')!;
    expect(mark).toBeTruthy();
    expect(mark.className).toContain('whitespace-nowrap');
    expect(screen.getByText(HERO.eyebrow)).toBeTruthy();
    expect(screen.getByText(HERO.eyebrowPill)).toBeTruthy();
    expect(screen.getByText(HERO.finePrint)).toBeTruthy();
    expect(screen.getByRole('button', { name: HERO.heroCta })).toBeTruthy();
  });

  it('sub is the decided line', () => {
    const { container } = render(<Hero />);
    const sub = container.querySelector('h1 + p')!.textContent;
    expect(sub).toBe('Rival Monday tracks their map rankings, reviews and ads, then writes a Monday brief with the evidence attached. You sell it under your brand, at your price.');
    expect(sub).toBe(HERO.sub);
  });

  it('secondary button is hidden on phones', () => {
    render(<Hero />);
    const link = screen.getByRole('link', { name: HERO.secondaryCta });
    expect(link.className).toContain('hidden');
    expect(link.className).toContain('sm:inline-flex');
  });

  it('the radar is still', () => {
    const { container } = render(<Hero />);
    for (const el of container.querySelectorAll('[class]')) expect(el.getAttribute('class'), el.outerHTML.slice(0, 80)).not.toMatch(/sweep|blip/);
    expect(container.querySelector('.radar svg')).toBeTruthy();
  });

  it('primary button opens the join dialog on the sample start', () => {
    render(<Hero />);
    fireEvent.click(screen.getByRole('button', { name: HERO.heroCta }));
    expect(join.open).toHaveBeenCalledWith('agency-sample');
  });

  it('the hero image is described and loads first', () => {
    render(<Hero />);
    const img = screen.getByRole('img', { name: HOME_IMAGES.hero.alt });
    expect(img.getAttribute('src')).toBe(HOME_IMAGES.hero.src);
    expect(img.getAttribute('loading')).toBeNull();
  });

  it('the screenshot collage is described and labelled as sample data', () => {
    render(<Hero />);
    for (const shot of [HOME_IMAGES.heroMap, HOME_IMAGES.heroFriday]) {
      expect(screen.getByRole('img', { name: shot.alt }).getAttribute('src')).toBe(shot.src);
    }
    expect(screen.getByText(HOME_IMAGES.hero.caption)).toBeTruthy();
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

  it('secondary CTA is the outlined ghost button (D14) linking to the client tour, not a second filled button', () => {
    render(<Hero />);
    const link = screen.getByRole('link', { name: HERO.secondaryCta });
    expect(link.getAttribute('href')).toBe('#client-view');
    expect(link.className).toContain('btn-ink-ghost');
    expect(link.className).not.toContain('bg-primary');
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

  it('site-owned classes survive in the DOM', () => {
    const { container } = render(<Hero />);
    expect(container.querySelector('h1')!.className).toContain('text-display');
    expect(container.querySelector('[data-slot="hero"] > img.night-map')!.getAttribute('alt')).toBe('');
    expect(container.querySelectorAll('.night-veil')).toHaveLength(1);
  });

  it('the pilot pill is the only orange fill; the other orange (the headline underline) is decorative and aria-hidden (D14)', () => {
    const { container } = render(<Hero />);
    const amber = [...container.querySelectorAll('[class*="bg-amber"]')];
    expect(amber.map((e) => e.getAttribute('data-slot') ?? e.textContent)).toEqual(['Pilot']);
    for (const el of container.querySelectorAll('.radar, h1 svg')) expect(el.closest('[aria-hidden="true"]')).toBeTruthy();
  });
});
