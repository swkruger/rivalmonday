import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', () => ({ usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }) }));
vi.mock('../join/join-provider', () => ({ useJoin: () => ({ open: () => {} }) }));
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test' } }));

import { HERO, HOME_IMAGES } from '../../../content/home';
import { Hero } from './hero';

beforeEach(() => {
  pilot.pilotMode = true;
});

describe('Hero', () => {
  it('renders the decided headline, eyebrow and sub exactly', () => {
    const { container } = render(<Hero />);
    const h1 = container.querySelector('h1')!;
    expect(h1.textContent).toBe(HERO.headline);
    expect(screen.getByText(HERO.eyebrow)).toBeTruthy();
    expect(screen.getByText(HERO.eyebrowPill)).toBeTruthy();
    expect(screen.getByText(HERO.sub)).toBeTruthy();
    expect(screen.getByText(HERO.finePrint)).toBeTruthy();
    expect(screen.getByRole('button', { name: HERO.primaryCta })).toBeTruthy();
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

  it('site-owned classes survive in the DOM', () => {
    const { container } = render(<Hero />);
    expect(container.querySelector('h1')!.className).toContain('text-display');
    expect(container.querySelector('[data-slot="hero"] > img.night-map')!.getAttribute('alt')).toBe('');
    expect(container.querySelectorAll('.night-veil')).toHaveLength(1);
  });

  it('shows no orange other than the pilot pill', () => {
    const { container } = render(<Hero />);
    const amber = [...container.querySelectorAll('[class*="bg-amber"]')];
    expect(amber.map((e) => e.getAttribute('data-slot') ?? e.textContent)).toEqual(['Pilot']);
  });
});
