// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SelfNotice } from './self-notice';

describe('SelfNotice', () => {
  it('says the profile check is pending, with no Business profile link, for anyone', () => {
    render(<SelfNotice clientId="c1" selfPending isAgency />);
    expect(screen.getByText('Your own reviews appear after the next Google profile check.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('asks the agency to add a place id, with a Business profile link', () => {
    render(<SelfNotice clientId="c1" selfPending={false} isAgency />);
    expect(screen.getByText(/Add your Google place id on the Business profile page/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Business profile' }).getAttribute('href')).toBe('/c/c1/settings/profile');
  });

  it('shows clients the text only', () => {
    render(<SelfNotice clientId="c1" selfPending={false} isAgency={false} />);
    expect(screen.getByText(/Add your Google place id on the Business profile page/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
