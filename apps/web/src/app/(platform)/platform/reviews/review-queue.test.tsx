// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';
import type { FormResult } from '@/server/forms';
import { ReviewQueue } from './review-queue';

const item = {
  id: 'r1', createdAt: '2026-10-07T00:00:00.000Z', competitorName: 'Smith HVAC', source: 'web', kind: 'added', sourceText: 'Website', kindText: 'Added', age: '3 days ago', beforeText: null, afterText: 'Now offering duct cleaning',
  questions: [{ key: 'meaningful', type: 'noul' as const, instructions: 'Is this a meaningful business change?', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], modelAnswer: 'false', confidence: 0.2 }],
};

const operator = (node: React.ReactNode) => <HelpProvider value={{ audience: 'operator', names: { agency: 'your agency', assistant: 'Sunny' } }}>{node}</HelpProvider>;

describe('ReviewQueue', () => {
  it('shows the change and the model’s guess, posts the answers, and keeps the result after the item leaves', async () => {
    // Typed with (prev, fd) params (unused) so `action.mock.calls[0]![1]` below is typed as FormData, matching `ReviewQueue`'s action prop.
    const action = vi.fn(async (_prev: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Resolved — a new event was created.' }));
    const { rerender } = render(operator(<ReviewQueue items={[item]} total={1} action={action} />));
    expect(screen.getByText('Now offering duct cleaning')).toBeTruthy();
    expect(screen.getByText('Waiting for review (1)')).toBeTruthy();
    expect(screen.getByText('Smith HVAC · Website · Added · 3 days ago')).toBeTruthy();
    expect(screen.getByText(/model said: No \(20%\)/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Is this a meaningful business change?'), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(screen.getByText('Resolved — a new event was created.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('reviewId'), fd.get('q:meaningful')]).toEqual(['r1', 'true']);
    rerender(operator(<ReviewQueue items={[]} total={0} action={action} />));
    expect(screen.getByText('Resolved — a new event was created.')).toBeTruthy();
    expect(screen.getByText('Nothing waiting for review')).toBeTruthy();
  });
});
