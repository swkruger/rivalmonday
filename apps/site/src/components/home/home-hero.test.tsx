import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHOOSER } from '../../../content/chooser';
import { DoorsBand } from './doors-band';
import { HomeHero } from './home-hero';

describe('HomeHero', () => {
  it('headline is the decided lead and mark in one h1', () => {
    const { container } = render(<HomeHero />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    const h1 = container.querySelector('h1')!;
    expect(h1.textContent).toBe('See what local rivals did this week.');
    expect(h1.textContent).toBe(`${CHOOSER.headline.lead} ${CHOOSER.headline.mark}`);
    expect([...h1.querySelectorAll('span')].some((e) => e.textContent === 'this week.')).toBe(true);
    expect(screen.getByRole('heading', { level: 2, name: 'Which one are you?' })).toBeTruthy();
  });

  it('two doors link to /agencies and /business with the decided titles', () => {
    render(<HomeHero />);
    const group = screen.getByRole('list', { name: CHOOSER.question });
    const links = within(group).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/agencies', '/business']);
    expect(links[0]!.textContent).toContain('I run an agency');
    expect(links[0]!.textContent).toContain('For agencies →');
    expect(links[1]!.textContent).toContain('I own a local business');
    expect(links[1]!.textContent).toContain('For local businesses →');
  });

  it('the sample-brief link points to /sample-brief', () => {
    render(<HomeHero />);
    expect(screen.getByRole('link', { name: 'See a sample brief' }).getAttribute('href')).toBe('/sample-brief');
    expect(screen.getByText(CHOOSER.sample.lead, { exact: false })).toBeTruthy();
  });

  it('no join button and no price', () => {
    const { container } = render(<HomeHero />);
    expect(screen.queryByRole('button', { name: /free brief|join|pilot/i })).toBeNull();
    expect(container.textContent).not.toMatch(/[$\d]/);
  });

  it('doors band repeats the same two doors', () => {
    const { container } = render(<DoorsBand />);
    const section = container.querySelector('section#choose') as HTMLElement;
    expect(section).toBeTruthy();
    expect(within(section).getByRole('heading', { level: 2, name: CHOOSER.bandHeading })).toBeTruthy();
    const links = within(section).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/agencies', '/business']);
    expect(links.map((a) => a.textContent)).toEqual(CHOOSER.doors.map((d) => `${d.title}${d.body}${d.cta}`));
    expect(section.getAttribute('aria-labelledby')).toBe('choose-heading');
  });
});
