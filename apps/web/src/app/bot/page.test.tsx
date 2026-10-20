// @vitest-environment jsdom
import { RIVAL_MONDAY_TOKENS } from '@cs/email/branding';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import BotPage from './page';

afterEach(cleanup);

describe('/bot', () => {
  it('pins the Rival Monday theme on <main> so an agency theme on <html> cannot leak in', () => {
    const { container } = render(<BotPage />);
    const main = container.querySelector('main') as HTMLElement;
    expect(main.style.getPropertyValue('--secondary').toLowerCase()).toBe(RIVAL_MONDAY_TOKENS.secondary.toLowerCase());
    expect(main.style.getPropertyValue('--primary').toLowerCase()).toBe(RIVAL_MONDAY_TOKENS.primary.toLowerCase());
  });
});
