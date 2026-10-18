// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LookupStep } from './lookup-step';

afterEach(cleanup);

describe('LookupStep', () => {
  it('a failed search shows the alert and focuses it', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const find = vi.fn().mockResolvedValue({ ok: false, error: 'Lookup failed' });
    render(
      <LookupStep find={find} createFromLookup={vi.fn()} createByHand={vi.fn()} verticals={[]} timezoneOptions={[]} />,
    );
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('City and state, or ZIP'), { target: { value: 'Austin, TX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find business' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Lookup failed');
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });
});
