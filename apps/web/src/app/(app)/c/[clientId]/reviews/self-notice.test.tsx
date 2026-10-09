// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SelfNotice } from './self-notice';

describe('SelfNotice', () => {
  it('says the profile check is pending, with no Profile link, for anyone', () => {
    render(<SelfNotice clientId="c1" selfPending isAgency />);
    expect(screen.getByText('Your own reviews appear after the next Google profile check.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('asks the agency to add a place id, with a Profile link', () => {
    render(<SelfNotice clientId="c1" selfPending={false} isAgency />);
    expect(screen.getByText(/Add your Google place id on the Profile page/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Profile' }).getAttribute('href')).toBe('/c/c1/settings/profile');
  });

  it('shows clients the text only', () => {
    render(<SelfNotice clientId="c1" selfPending={false} isAgency={false} />);
    expect(screen.getByText(/Add your Google place id on the Profile page/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
