import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pilot = vi.hoisted(() => ({ pilotMode: true }));
vi.mock('../shell/pilot-context', () => ({ usePilot: () => ({ pilotMode: pilot.pilotMode, status: null, loaded: true }) }));
vi.mock('../join/join-provider', () => ({ useJoin: () => ({ open: () => {} }) }));
vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test' } }));

import { FEATURE_ROWS, PLAN_CARDS, PRICING_FAQ } from '../../../content/pricing-page';
import { faqPageLd } from '../../lib/json-ld';
import { Faq } from './faq';
import { FeatureTable } from './feature-table';
import { PlanCards } from './plan-cards';

beforeEach(() => {
  pilot.pilotMode = true;
});

describe('PlanCards', () => {
  it('pilot cards say free during the pilot', () => {
    render(<PlanCards />);
    expect(screen.getAllByText('Free during the pilot')).toHaveLength(2);
    expect(screen.getByText(PLAN_CARDS.pilot.agency.note)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join the pilot' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join the waitlist' })).toBeTruthy();
  });

  it('pilot off shows trial cards and the business waitlist', () => {
    pilot.pilotMode = false;
    const { container } = render(<PlanCards />);
    expect(screen.queryByText('Free during the pilot')).toBeNull();
    expect(screen.getByText(PLAN_CARDS.trial.agency.note)).toBeTruthy();
    expect(screen.getByText(PLAN_CARDS.trial.business.price)).toBeTruthy();
    expect(container.textContent).not.toMatch(/Free during/);
    expect(screen.getByRole('link', { name: 'Start your free trial' }).getAttribute('href')).toBe('https://app.test/sign-up');
    expect(screen.getByRole('button', { name: 'Join the waitlist' })).toBeTruthy();
  });
});

describe('FeatureTable', () => {
  it('renders one row per feature', () => {
    render(<FeatureTable />);
    for (const r of FEATURE_ROWS) expect(screen.getByText(r.label)).toBeTruthy();
  });
});

describe('Faq', () => {
  it('faq ld matches visible questions', () => {
    const { container } = render(<Faq />);
    const visible = [...container.querySelectorAll('details summary')].map((s) => s.textContent);
    const ld = faqPageLd(PRICING_FAQ) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(ld.mainEntity.map((m) => m.name)).toEqual(visible);
    const answers = [...container.querySelectorAll('details > p:first-of-type')].map((p) => p.textContent);
    expect(ld.mainEntity.map((m) => m.acceptedAnswer.text)).toEqual(answers);
    expect(container.querySelector('a[href="/sources"]')).toBeTruthy();
  });
});
