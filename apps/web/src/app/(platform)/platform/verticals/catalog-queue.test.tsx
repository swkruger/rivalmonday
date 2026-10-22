// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';
import type { FormResult } from '@/server/forms';
import { CatalogQueue, quotesOf, type ReviewArea, type ReviewVertical } from './catalog-queue';

afterEach(cleanup);

const v: ReviewVertical = {
  id: 'distillery', name: 'Craft distilleries',
  services: [{ id: 'tasting_room', name: 'Tasting room' }, { id: 'tours', name: 'Distillery tours' }],
  createdBy: { agencyId: 'a', name: 'Agency A' }, clientCount: 1, draftCostUsd: 0.031, categories: ['Distillery'],
  evidence: { areas: [{ name: 'Tasting room', quote: 'Tasting room open Thursday' }] },
  detail: { audienceNoun: 'guests', seedKeywords: ['distillery tour'], primaryCategories: ['Distillery'], relatedCategories: [], topics: ['Tour quality'], areas: [{ id: 'tasting_room', name: 'Tasting room', aliases: ['tastings'] }, { id: 'tours', name: 'Distillery tours', aliases: [] }] },
};
const area: ReviewArea = { verticalId: 'dental', verticalName: 'Dental', id: 'sedation', name: 'Sedation', aliases: [], createdBy: null, clientCount: 0, evidence: null };
const targets = [{ id: 'dental', name: 'Dental', status: 'reviewed', services: [{ id: 'sedation', name: 'Sedation' }, { id: 'cleanings', name: 'Cleanings' }] }];
const maps = { distillery: { dental: { tasting_room: null, tours: null } } };

function setup(over: Partial<React.ComponentProps<typeof CatalogQueue>> = {}) {
  const action = vi.fn(async (_p: FormResult, _fd: FormData): Promise<FormResult> => ({ ok: true, message: 'Approved “Craft distilleries”.' }));
  render(<CatalogQueue verticals={[v]} areas={[area]} targets={targets} catalogue={targets} defaultMaps={maps} canEdit action={action} {...over} />);
  return action;
}

describe('CatalogQueue', () => {
  it('shows the empty state per section', () => {
    cleanup();
    render(<HelpProvider value={{ audience: 'operator', names: { agency: 'your agency', assistant: 'Sunny' } }}><CatalogQueue verticals={[]} areas={[]} targets={targets} catalogue={targets} defaultMaps={maps} canEdit action={vi.fn()} /></HelpProvider>);
    expect(screen.getAllByText('Nothing to review')).toHaveLength(2);
  });

  it('approves a business type and keeps the message', async () => {
    const action = setup();
    expect(screen.getByText(/Agency A · 1 client · draft cost \$0.031/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve Craft distilleries' }));
    await waitFor(() => expect(screen.getByText('Approved “Craft distilleries”.')).toBeTruthy());
    const fd = action.mock.calls[0]![1];
    expect([fd.get('intent'), fd.get('id'), fd.get('label')]).toEqual(['approve-vertical', 'distillery', 'Craft distilleries']);
  });

  it('merges with an area map defaulting to the supplied mapping and lets the operator change it', async () => {
    const action = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Merge Craft distilleries into another' }));
    fireEvent.change(screen.getByLabelText('Merge into'), { target: { value: 'dental' } });
    fireEvent.change(screen.getByLabelText('Where Tasting room goes'), { target: { value: 'cleanings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const fd = action.mock.calls[0]![1];
    expect(fd.get('intent')).toBe('merge-vertical');
    expect(fd.get('targetId')).toBe('dental');
    expect(JSON.parse(String(fd.get('payload')))).toEqual({ tasting_room: 'cleanings', tours: null });
  });

  it('edit sends only the changed fields', async () => {
    const action = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Craft distilleries' }));
    fireEvent.change(screen.getByLabelText('Business type name'), { target: { value: 'Distilleries' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const fd = action.mock.calls[0]![1];
    expect(fd.get('intent')).toBe('edit-vertical');
    expect(JSON.parse(String(fd.get('payload')))).toEqual({ name: 'Distilleries' });
  });

  it('hides every write control from a viewer', () => {
    setup({ canEdit: false });
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
  });

  it('collects evidence quotes', () => {
    expect(quotesOf(v.evidence)).toEqual(['Tasting room open Thursday']);
    expect(quotesOf(null)).toEqual([]);
  });
});
