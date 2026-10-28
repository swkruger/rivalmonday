// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';
import { RunbookEditor } from './runbook-editor';
import type { ItemState, RunbookAction, RunbookData, RunbookItemData } from './types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const play = (id: string, title: string, over: Partial<RunbookItemData> = {}, template = `Do ${title} for {{service}}.`): RunbookItemData => ({
  key: `play:${id}`, kind: 'play', content: { trigger: 'price_change', title, template, effort: 'M', impact: 'H' }, enabled: true, businessAreaIds: null, version: 1,
  customised: false, upstreamVersion: 1, dismissedUpstreamVersion: null, state: 'in_sync', parent: null, ...over,
});
const withState = (state: ItemState, over: Partial<RunbookItemData> = {}) => ({ state, ...over });

const data = (items: RunbookItemData[], over: Partial<RunbookData> = {}): RunbookData => ({
  level: 'agency', tailorStatus: null, items, vars: ['competitor', 'service', 'new_price', 'areas', 'topic'], businessAreas: [], ...over,
});
const ok: RunbookAction = vi.fn(async () => ({ ok: true as const }));

describe('RunbookEditor', () => {
  it('shows the decided badge for each state and the prompts for new and removed items', () => {
    const items = [
      play('a', 'Inherited play'),
      play('b', 'Customised play', { customised: true }),
      play('c', 'Updated play', withState('update_available', { parent: { content: { trigger: 'price_change', title: 'Updated play', template: 'New text' }, version: 2 } })),
      play('d', 'Brand new play', withState('new_upstream', { enabled: false, version: 0, upstreamVersion: null, parent: { content: {}, version: 1 } })),
      play('e', 'Dropped play', withState('removed_upstream')),
    ];
    render(<RunbookEditor data={data(items)} canEdit action={ok} />);
    const badge = (key: string, text: string) => expect(within(document.querySelector(`[data-item="play:${key}"]`) as HTMLElement).getAllByText(text).length).toBeGreaterThan(0);
    badge('a', 'Inherited');
    badge('b', 'Customised');
    badge('c', 'Update available');
    badge('d', 'New');
    badge('e', 'Removed upstream');
    expect(screen.getByText('New play available')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(screen.getByText('No longer in the standard runbook')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Keep' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Plays' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Starting-point rules' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
  });

  it('shows no inheritance badge at the platform level', () => {
    render(<RunbookEditor data={data([play('a', 'Base play')], { level: 'platform' })} canEdit action={ok} />);
    expect(screen.queryByText('Inherited')).toBeNull();
  });

  it('renders the diff for an update and sends dismiss / pull from its buttons', async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    const item = play('c', 'Updated play', withState('update_available', { parent: { content: { trigger: 'price_change', title: 'Updated play', template: 'Do Updated play for {{service}} today.' }, version: 2 } }));
    render(<RunbookEditor data={data([item])} canEdit action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review update' }));
    const diff = screen.getByTestId('runbook-diff');
    expect(diff.querySelector('ins')?.textContent).toMatch(/today/);
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'dismiss', key: 'play:c' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use the update' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'pull', key: 'play:c' }));
  });

  it('diffs a customised item from the snapshot to the new parent text and shows "Your version" beneath', () => {
    const snap = { trigger: 'price_change', title: 'Old', template: 'Old text for {{service}}.' };
    const item = play('c', 'My wording', {
      customised: true, content: { trigger: 'price_change', title: 'My wording', template: 'My own text.' }, upstreamSnapshot: { content: snap },
      ...withState('update_available', { parent: { content: { trigger: 'price_change', title: 'Old', template: 'Old text for {{service}} now.' }, version: 2 } }),
    });
    render(<RunbookEditor data={data([item])} canEdit action={ok} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review update' }));
    const diff = screen.getByTestId('runbook-diff');
    expect(diff.textContent).toMatch(/^Old text for/);
    expect(diff.textContent).not.toMatch(/My own text/);
    expect(diff.querySelector('ins')?.textContent).toMatch(/now/);
    expect(screen.getByTestId('runbook-yours').textContent).toMatch(/My own text\./);
  });

  it('a new setting from above shows only Add / Not now, no fields', () => {
    const knob: RunbookItemData = { ...play('x', 'x'), key: 'knob:thresholds', kind: 'knob', content: { alert: 70, brief: 40 }, enabled: false, ...withState('new_upstream', { parent: { content: { alert: 70, brief: 40 }, version: 1 } }) };
    render(<RunbookEditor data={data([knob])} canEdit action={ok} />);
    expect(screen.getByText('New setting available')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save thresholds' })).toBeNull();
    expect(screen.queryByLabelText('Weekly brief from score')).toBeNull();
  });

  it('at the client level "Use the update" asks for a tailored version first and offers "Use as is"', async () => {
    const parent = { content: { trigger: 'price_change', title: 'Updated play', template: 'Agency text' }, version: 2 };
    const action = vi.fn(async (op: { op: string }) => (op.op === 'retailor' ? { ok: true as const, proposed: { title: 'Updated play', template: 'Tailored text', businessAreaIds: null } } : { ok: true as const }));
    const d = data([play('c', 'Updated play', withState('update_available', { parent }))], { level: 'client', source: 'client' });
    render(<RunbookEditor data={d} canEdit action={action as RunbookAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review update' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use the update' }));
    await screen.findByText('Tailored for this client');
    expect(screen.getByText('Tailored text')).toBeTruthy();
    // The stage flips inside the retailor transition, so Approve is disabled until that transition settles; clicking a disabled button is a no-op.
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect((approve as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(approve);
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'pull', key: 'play:c', content: { trigger: 'price_change', title: 'Updated play', template: 'Tailored text' }, businessAreaIds: null }));
    expect(await screen.findByRole('button', { name: 'Use as is' })).toBeTruthy();
  });

  it('disables the switches and hides the edit controls for read-only roles', () => {
    render(<RunbookEditor data={data([play('a', 'Some play')])} canEdit={false} action={ok} />);
    for (const s of screen.getAllByRole('switch')) expect((s as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('is read-only inside a support session even for an editor role', () => {
    render(<ReadOnlyProvider readOnly><RunbookEditor data={data([play('a', 'Some play')])} canEdit action={ok} /></ReadOnlyProvider>);
    for (const s of screen.getAllByRole('switch')) expect((s as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('edits a play and refuses an unknown placeholder before calling the tool', async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(<RunbookEditor data={data([play('a', 'Some play')])} canEdit action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'Hi {{client}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toMatch(/\{\{client\}\}/);
    expect(action).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'Hi {{competitor}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'save', key: 'play:a', content: expect.objectContaining({ template: 'Hi {{competitor}}', title: 'Some play' }) }));
  });

  it('uses the same refusal copy as alert rules for thresholds', () => {
    const knob: RunbookItemData = { ...play('x', 'x'), key: 'knob:thresholds', kind: 'knob', content: { alert: 70, brief: 40 } };
    const action = vi.fn(async () => ({ ok: true as const }));
    render(<RunbookEditor data={data([knob])} canEdit action={action} />);
    fireEvent.change(screen.getByLabelText('Weekly brief from score'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save thresholds' }));
    expect(screen.getByRole('alert').textContent).toBe('The brief threshold must be lower than the alert threshold.');
    expect(action).not.toHaveBeenCalled();
  });

  it('a client without a runbook shows the banner, read-only plays and a create button', async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(<RunbookEditor data={data([play('a', 'Some play')], { level: 'client', source: 'agency' })} canEdit action={action} />);
    expect(screen.getByText('This client uses the agency runbook.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create a runbook for this client' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'create' }));
  });

  it('shows the tailoring and failure messages', () => {
    const base = data([play('a', 'Some play')], { level: 'client', source: 'client', tailorStatus: 'pending' });
    const { rerender } = render(<RunbookEditor data={base} canEdit action={ok} verticalName="HVAC & plumbing" statusAction={async () => 'pending'} />);
    expect(screen.getByText('Tailoring plays for HVAC & plumbing…')).toBeTruthy();
    rerender(<RunbookEditor data={{ ...base, tailorStatus: 'failed' }} canEdit action={ok} />);
    expect(screen.getByText('We couldn’t tailor these plays. They match the agency runbook; edit them as needed.')).toBeTruthy();
  });

  it('shows a refusal from the action where it survives revalidation', async () => {
    const action = vi.fn(async () => ({ ok: false as const, error: 'Not found' }));
    render(<RunbookEditor data={data([play('a', 'Some play')])} canEdit action={action} />);
    fireEvent.click(screen.getAllByRole('switch')[0]!);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Switch off' }));
    await screen.findByText('Not found');
  });

  it('runbook trigger shows "Price change" for price_change', () => {
    render(<RunbookEditor data={data([play('a', 'Some play'), play('b', 'Rival move', { content: { trigger: 'territory_expansion', title: 'Rival move', template: 'x' } })])} canEdit action={ok} />);
    expect(screen.getAllByText('Price change').length).toBeGreaterThan(0);
    expect(screen.getByText('Territory expansion')).toBeTruthy();
    expect(screen.queryByText('price change')).toBeNull();
    expect(screen.queryByText('price_change')).toBeNull();
  });

  it('switching a play off asks first; switching on does not', async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(<RunbookEditor data={data([play('a', 'Some play'), play('b', 'Other play', { enabled: false })])} canEdit action={action} />);
    const [on, off] = screen.getAllByRole('switch');
    fireEvent.click(off!);
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'toggle', key: 'play:b', enabled: true }));
    action.mockClear();
    fireEvent.click(on!);
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'toggle', key: 'play:a', enabled: false }));
  });

  it('removing an item no longer in the level above asks first', async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    render(<RunbookEditor data={data([play('e', 'Dropped play', withState('removed_upstream'))])} canEdit action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'remove', key: 'play:e' }));
  });

  it('using the update on a customised item asks first', async () => {
    const action = vi.fn(async () => ({ ok: true as const }));
    const item = play('c', 'My wording', {
      customised: true, content: { trigger: 'price_change', title: 'My wording', template: 'Mine.' },
      ...withState('update_available', { parent: { content: { trigger: 'price_change', title: 'Theirs', template: 'Theirs.' }, version: 2 } }),
    });
    render(<RunbookEditor data={data([item])} canEdit action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review update' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use the update' }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Use the update' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'pull', key: 'play:c' }));
  });

  it('keeps data-item on a card root that holds its actions and a muted band for prompts', () => {
    const item = play('d', 'Brand new play', withState('new_upstream', { enabled: false, version: 0, upstreamVersion: null, parent: { content: {}, version: 1 } }));
    render(<RunbookEditor data={data([item])} canEdit action={ok} />);
    const root = document.querySelector('[data-item="play:d"]') as HTMLElement;
    expect(root.getAttribute('data-slot')).toBe('card');
    expect(within(root).getByRole('button', { name: 'Add' })).toBeTruthy();
    expect(root.querySelector('[data-slot="band"][data-tone="muted"]')).toBeTruthy();
  });

  it('lists the settings as rows of one frame and keeps each switch name', () => {
    const knob = (n: string): RunbookItemData => ({ ...play('x', 't'), key: `knob:${n}`, kind: 'knob', content: n === 'thresholds' ? { alert: 80, brief: 40 } : {} } as RunbookItemData);
    render(<RunbookEditor data={data([knob('thresholds')])} canEdit action={ok} />);
    const row = document.querySelector('[data-item="knob:thresholds"]') as HTMLElement;
    expect(row.getAttribute('data-slot')).toBeNull();
    expect(row.parentElement?.getAttribute('data-slot')).toBe('frame');
    expect(within(row).getByRole('switch', { name: 'Alert and brief thresholds on or off' })).toBeTruthy();
  });
});
