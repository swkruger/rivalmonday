// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const callTool = vi.fn(async () => ({ questions: ['What changed this week?', 'Who cut prices?'], reviewAllowed: true }));
vi.mock('@/server/tools', () => ({ callTool }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/ask', () => ({ assistantNameFor: async () => 'Robin' }));
const { AskCard } = await import('./ask-card');

const A = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const ctx = (features: string[], userId = 'u1') =>
  createAccessContext({ agencyId: A, userId, role: 'client_owner', clientScope: [C], features: features as never });

describe('AskCard', () => {
  it('ask card hidden without ask feature', async () => {
    expect(await AskCard({ clientId: C, ctx: ctx(['dashboard']) })).toBeNull();
    expect(await AskCard({ clientId: C, ctx: ctx(['ask'], 'contact:abc') })).toBeNull();
    expect(callTool).not.toHaveBeenCalled();
  });
  it('is not rendered inside a support session (Ask tools are hidden there)', async () => {
    const support = createAccessContext({ agencyId: A, userId: 'op', role: 'agency_admin', clientScope: 'all', features: ['ask'] as never, support: { sessionId: C, platformUserId: 'op' } });
    expect(await AskCard({ clientId: C, ctx: support })).toBeNull();
    expect(callTool).not.toHaveBeenCalled();
  });
  it('shows the name and starter chips linking to the Ask page', async () => {
    render(<>{await AskCard({ clientId: C, ctx: ctx(['ask']) })}</>);
    expect(screen.getByText('Ask Robin')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'What changed this week?' }).getAttribute('href')).toBe(`/c/${C}/ask?q=${encodeURIComponent('What changed this week?')}`);
  });
  it('has a question box that opens the Ask page with the question', async () => {
    render(<>{await AskCard({ clientId: C, ctx: ctx(['ask']) })}</>);
    const box = screen.getByRole('textbox', { name: 'Ask Robin a question' });
    expect(box.getAttribute('name')).toBe('q');
    expect(box.getAttribute('maxlength')).toBe('2000');
    expect(box.hasAttribute('required')).toBe(true);
    const form = box.closest('form')!;
    expect(form.getAttribute('action')).toBe(`/c/${C}/ask`);
    expect(form.getAttribute('method')).toBe('get');
    expect(screen.getByRole('button', { name: 'Ask' }).getAttribute('type')).toBe('submit');
  });
});
