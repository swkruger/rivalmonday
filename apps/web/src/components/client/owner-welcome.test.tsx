// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dismiss = vi.fn(async (_id: string) => {});
vi.mock('./owner-welcome-actions', () => ({ dismissWelcome: (id: string) => dismiss(id) }));

const { OwnerPickCard, OwnerWelcome, welcomeLine } = await import('./owner-welcome');

afterEach(() => { cleanup(); dismiss.mockClear(); });

describe('welcomeLine', () => {
  it('names the owner and the agency, without gendered words', () => {
    expect(welcomeLine('Maria', 'Brightside Marketing')).toBe('Welcome, Maria. Brightside Marketing set this up for you. Your starting point is on its way.');
  });
  it('drops the name when it is unknown', () => {
    expect(welcomeLine(null, 'Brightside Marketing')).toBe('Welcome. Brightside Marketing set this up for you. Your starting point is on its way.');
  });
});

describe('OwnerWelcome', () => {
  it('welcome line hides after dismiss', () => {
    render(<OwnerWelcome clientId="c1" line="Welcome, Maria. Brightside Marketing set this up for you. Your starting point is on its way." />);
    expect(screen.getByText(/Welcome, Maria\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Welcome, Maria\./)).toBeNull();
    expect(dismiss).toHaveBeenCalledWith('c1');
  });
});

describe('OwnerPickCard', () => {
  it('asks in the agency name and links to the owner competitors page', () => {
    render(<OwnerPickCard clientId="c1" agency="Brightside Marketing" count={9} place="Round Rock" />);
    expect(screen.getByText('Brightside Marketing asked you to choose who to watch')).toBeTruthy();
    expect(screen.getByText('We found 9 businesses near Round Rock. Pick up to 5 to compare with you every week.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Choose competitors' }).getAttribute('href')).toBe('/c/c1/setup/competitors');
  });
  it('leaves out the count and place when unknown', () => {
    render(<OwnerPickCard clientId="c1" agency="Brightside Marketing" count={0} place={null} />);
    expect(screen.getByText('Pick up to 5 to compare with you every week.')).toBeTruthy();
  });
});
