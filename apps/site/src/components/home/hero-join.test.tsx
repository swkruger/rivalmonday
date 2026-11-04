import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/env', () => ({ siteEnv: { appUrl: 'https://app.test', clientPriceUsd: 99, social: {}, turnstileSiteKey: null } }));
vi.mock('../../lib/site-status', async (orig) => ({ ...(await orig<typeof import('../../lib/site-status')>()), fetchSiteStatus: async () => null }));

import { HERO } from '../../../content/home';
import { JoinProvider } from '../join/join-provider';
import { PilotProvider } from '../shell/pilot-context';
import { Hero } from './hero';

afterEach(cleanup);

describe('Hero primary button with the real join dialog', () => {
  it('opens the agency step with the sample box ticked', async () => {
    render(
      <PilotProvider>
        <JoinProvider>
          <Hero />
          
        </JoinProvider>
      </PilotProvider>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: HERO.heroCta }));
    expect(screen.getByText('About your agency')).toBeTruthy();
    expect((screen.getByLabelText('Send me a real sample brief for one of my clients') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText(/Client business name/)).toBeTruthy();
  });
});
