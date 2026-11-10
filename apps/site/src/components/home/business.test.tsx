import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', () => ({ usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }) }));
const join = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('../join/join-provider', () => ({ useJoin: () => join }));
const nav = vi.hoisted(() => ({ pathname: '/business' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {}, comparePages: [] as string[], turnstileSiteKey: null as string | null } }));

import { BUSINESS, BUSINESS_ANCHORS } from '../../../content/business';
import { CLIENT_VIEW } from '../../../content/client-view';
import { PRICING } from '../../../content/pricing';
import BusinessPage from '../../app/business/page';
import { SideProvider } from '../shell/side-context';
import { MobileCta } from './mobile-cta';

beforeEach(() => {
  pilot.pilotMode = true;
  join.open.mockClear();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BusinessPage', () => {
  it('hero copy is the decided copy', () => {
    const { container } = render(<BusinessPage />);
    const h1 = container.querySelector('h1')!;
    expect(h1.textContent).toBe('Your competitors are making moves. Are you watching?');
    expect(screen.getByText('Competitor tracking for local businesses')).toBeTruthy();
    expect(container.querySelector('h1 + p')!.textContent).toBe(
      'Every Monday you get a short brief on what the businesses near you changed: map rankings, reviews and ads, with the evidence one click away.',
    );
    const hero = container.querySelector('main > :first-child') as HTMLElement;
    expect(hero.textContent).not.toContain('Pilot');
    const secondary = [...hero.querySelectorAll('a')].find((a) => a.textContent === 'See a sample brief')!;
    expect(secondary.getAttribute('href')).toBe('#sample');
    expect(screen.getAllByRole('button', { name: 'Join the waitlist' }).length).toBeGreaterThanOrEqual(2);
    for (const p of ['Public information only', 'No claim without evidence', 'Run for you by an agency']) expect(screen.getByText(p)).toBeTruthy();
    const price = `$${PRICING.business.monthlyUsd}`;
    expect(screen.getByText(`Free during the pilot · Then ${price}/mo · Set up for you by a local agency`)).toBeTruthy();
  });

  it('fine print follows pilot mode', () => {
    pilot.pilotMode = false;
    render(<BusinessPage />);
    expect(screen.queryByText(/Free during the pilot/)).toBeNull();
    expect(screen.getByText(`$${PRICING.business.monthlyUsd}/mo is a typical price · Set up for you by a local agency`)).toBeTruthy();
    expect(screen.getByText(BUSINESS.close.bodyTrial)).toBeTruthy();
    expect(screen.queryByText(BUSINESS.close.body)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Join the waitlist' }).length).toBeGreaterThanOrEqual(2);
  });

  it('one h1, no duplicate ids', () => {
    const { container } = render(<BusinessPage />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    const all = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
  });

  it('section ids are BUSINESS_ANCHORS', () => {
    const { container } = render(<BusinessPage />);
    expect([...container.querySelectorAll('main > section[id]')].map((s) => s.id)).toEqual([...BUSINESS_ANCHORS]);
    expect(container.querySelector('main > section#join h2')!.textContent).toBe(BUSINESS.close.heading);
  });

  it("the join section's button opens the business form", () => {
    const { container } = render(<BusinessPage />);
    fireEvent.click(container.querySelector('#join')!.querySelector('button')!);
    expect(join.open).toHaveBeenCalledWith('business');
  });

  it('the page never shows an agency plan number', () => {
    const a = PRICING.agency;
    const nums = [a.monthlyUsd, a.yearlyUsd, ...a.extraClientTiers.map((t) => t.usd)];
    const forbidden = [...new Set(nums.flatMap((n) => [`$${n}`, `$${n.toLocaleString('en-US')}`]))];
    for (const pilotMode of [true, false]) {
      pilot.pilotMode = pilotMode;
      const { container } = render(<BusinessPage />);
      const view = within(container.querySelector<HTMLElement>('#client-view')!);
      const texts = [container.textContent!];
      for (const name of ['Dashboard', 'Monday brief', 'Friday']) {
        fireEvent.mouseDown(view.getByRole('tab', { name }));
        texts.push(container.textContent!);
      }
      fireEvent.mouseDown(view.getByRole('tab', { name: 'Dashboard' }));
      for (const item of CLIENT_VIEW.nav) {
        fireEvent.click(view.getByRole('button', { name: item.label }));
        texts.push(container.textContent!);
      }
      for (const text of texts) for (const f of forbidden) expect(text.includes(f) && new RegExp(`${f.replace('$', '\\$')}(?![\\d,])`).test(text), `${pilotMode} ${f}`).toBe(false);
      cleanup();
    }
  }, 20_000);
});

describe('MobileCta on the business side', () => {
  it('business side shows Join the waitlist', () => {
    for (const pilotMode of [true, false]) {
      pilot.pilotMode = pilotMode;
      nav.pathname = '/business';
      const { container } = render(
        <SideProvider paths={{ agency: ['/agencies'], business: ['/business'] }}>
          <MobileCta />
        </SideProvider>,
      );
      const bar = container.querySelector<HTMLElement>('[data-slot="mobile-cta"]')!;
      const first = (pilotMode ? BUSINESS.hero.finePrint : BUSINESS.hero.finePrintTrial).split(' · ')[0]!;
      expect(bar.textContent).toContain(first);
      expect(bar.querySelector('a')).toBeNull();
      const button = within(bar).getByRole('button', { hidden: true });
      expect(button.textContent).toBe(BUSINESS.hero.primaryCta);
      fireEvent.click(button);
      expect(join.open).toHaveBeenLastCalledWith('business');
      cleanup();
    }
  });
});
