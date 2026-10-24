// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
const { SaveRecommendationDialog } = await import('./save-recommendation-dialog');

const C = '11111111-1111-4111-8111-111111111111';
const E1 = '00000000-0000-4000-8000-0000000000e1';
const props = { clientId: C, evidenceIds: [E1], defaultTitle: 'Acme cut prices', defaultRationale: 'Acme cut prices by ten percent.' };

describe('SaveRecommendationDialog', () => {
  it('double submit calls saveAction once', async () => {
    let finish!: (r: { ok: true; data: { id: string } }) => void;
    const saveAction = vi.fn().mockReturnValue(new Promise((res) => (finish = res)));
    render(<SaveRecommendationDialog {...props} saveAction={saveAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as recommendation' }));
    const form = (await screen.findByRole('button', { name: 'Save' })).closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(saveAction).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, data: { id: 'r1' } }));
  });

  it('after a save the trigger is gone and the status line shows', async () => {
    const saveAction = vi.fn().mockResolvedValue({ ok: true, data: { id: 'r1' } });
    render(<SaveRecommendationDialog {...props} saveAction={saveAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as recommendation' }));
    await act(async () => fireEvent.submit((await screen.findByRole('button', { name: 'Save' })).closest('form')!));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Saved to Recommendations.');
    expect(screen.queryByRole('button', { name: 'Save as recommendation' })).toBeNull();
    expect(saveAction).toHaveBeenCalledTimes(1);
  });
});
