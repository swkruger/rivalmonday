// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';
import { RunbookEditor } from './runbook-editor';
import type { RunbookAction, RunbookData, RunbookVoiceData } from './types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const LIMIT = "You've used today's 10 voice previews. Try again tomorrow.";
const V = { tone: 'friendly' as const, preferredTerms: [], bannedTerms: [] };
const voice = (over: Partial<RunbookVoiceData> = {}): RunbookVoiceData => ({ agency: V, own: null, effective: V, ...over });
const data = (over: Partial<RunbookData> = {}): RunbookData => ({ level: 'agency', tailorStatus: null, items: [], vars: [], businessAreas: [], voice: voice(), ...over });
const okAction = () => vi.fn<RunbookAction>(async () => ({ ok: true as const }));

const addBanned = (word: string) => {
  fireEvent.change(screen.getByLabelText('Banned words'), { target: { value: word } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
};
const region = () => screen.getByTestId('voice-result');

describe('Voice section', () => {
  it('agency level shows the Voice section; platform doesn’t', () => {
    render(<RunbookEditor data={data()} canEdit action={okAction()} />);
    expect(screen.getByRole('heading', { name: 'Voice' })).toBeTruthy();
    expect(screen.getByText('How briefs, alerts and recommendations are worded for every client. Facts and numbers never change.')).toBeTruthy();
    cleanup();
    render(<RunbookEditor data={data({ level: 'platform', voice: null })} canEdit action={okAction()} />);
    expect(screen.queryByRole('heading', { name: 'Voice' })).toBeNull();
  });

  it('caps terms at 20 and refuses bad characters', () => {
    const banned = Array.from({ length: 20 }, (_, i) => `word${String.fromCharCode(97 + i)}`);
    render(<RunbookEditor data={data({ voice: voice({ agency: { ...V, bannedTerms: banned }, effective: { ...V, bannedTerms: banned } }) })} canEdit action={okAction()} />);
    addBanned('extra');
    expect(region().textContent).toContain('Up to 20 words.');
    cleanup();
    render(<RunbookEditor data={data()} canEdit action={okAction()} />);
    addBanned('no$good');
    expect(region().textContent).toContain('Use letters, numbers, spaces, apostrophes or hyphens (up to 40 characters).');
    expect(screen.queryByText('no$good')).toBeNull();
  });

  it('refuses a word both preferred and banned, and a word listed twice', () => {
    const agency = { ...V, preferredTerms: [{ say: 'Fix', insteadOf: 'repair' }], bannedTerms: ['cheap'] };
    render(<RunbookEditor data={data({ voice: voice({ agency, effective: agency }) })} canEdit action={okAction()} />);
    addBanned('fix');
    expect(region().textContent).toContain('“fix” is both preferred and banned.');
    addBanned('CHEAP');
    expect(region().textContent).toContain('“CHEAP” is listed twice.');
  });

  it('save sends the whole VoiceSettings', async () => {
    const action = okAction();
    render(<RunbookEditor data={data()} canEdit action={action} />);
    fireEvent.click(screen.getByRole('radio', { name: /Direct/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a pair' }));
    fireEvent.change(screen.getByLabelText('Say'), { target: { value: 'quote' } });
    fireEvent.change(screen.getByLabelText('Instead of'), { target: { value: 'estimate' } });
    addBanned('cheap');
    fireEvent.click(screen.getByRole('button', { name: 'Save voice' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({
      op: 'save', key: 'knob:voice', content: { tone: 'direct', preferredTerms: [{ say: 'quote', insteadOf: 'estimate' }], bannedTerms: ['cheap'] },
    }));
    await waitFor(() => expect(region().textContent).toContain('Saved. New briefs and alerts use this voice.'));
  });

  it('client: agency voice shown, Set → fields prefilled', () => {
    const agency = { tone: 'formal' as const, preferredTerms: [], bannedTerms: ['cheap'] };
    const d = data({ level: 'client', source: 'client', voice: voice({ agency, effective: agency }) });
    render(<RunbookEditor data={d} canEdit action={okAction()} clientName="Acme" />);
    expect(screen.getByText('Uses the agency voice.')).toBeTruthy();
    expect(screen.getByText('How briefs, alerts and recommendations are worded for Acme.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set a voice for this client' }));
    expect((screen.getByRole('radio', { name: /Formal/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('cheap')).toBeTruthy();
  });

  it('Use the agency voice sends remove', async () => {
    const own = { tone: 'direct' as const, preferredTerms: [], bannedTerms: [] };
    const action = okAction();
    render(<RunbookEditor data={data({ level: 'client', source: 'client', voice: voice({ own, effective: own }) })} canEdit action={action} />);
    expect(screen.getByText('Own voice')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use the agency voice' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith({ op: 'remove', key: 'knob:voice' }));
  });

  it('read-only without a client runbook', () => {
    render(<RunbookEditor data={data({ level: 'client', source: 'agency' })} canEdit action={okAction()} />);
    expect(screen.getByText('Uses the agency voice.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set a voice for this client' })).toBeNull();
    cleanup();
    render(<ReadOnlyProvider readOnly><RunbookEditor data={data()} canEdit action={okAction()} /></ReadOnlyProvider>);
    expect(screen.queryByRole('button', { name: 'Save voice' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
  });

  it('preview shows text, flagged terms and the limit copy', async () => {
    const action = vi.fn<RunbookAction>()
      .mockResolvedValueOnce({ ok: true, preview: { text: 'A cheap rival cut prices.', bannedTerms: ['cheap'] } })
      .mockResolvedValueOnce({ ok: false, error: LIMIT });
    render(<RunbookEditor data={data({ voice: voice({ agency: { ...V, bannedTerms: ['cheap'] }, effective: { ...V, bannedTerms: ['cheap'] } }) })} canEdit action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(region().textContent).toContain('A cheap rival cut prices.'));
    expect(action).toHaveBeenCalledWith({ op: 'preview', voice: { tone: 'friendly', preferredTerms: [], bannedTerms: ['cheap'] } });
    expect(region().textContent).toContain('Sample alert');
    expect(region().textContent).toContain('This sample still uses: cheap.');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(region().textContent).toContain(LIMIT));
  });

  it('clears the preview when the form changes and when a preview fails', async () => {
    const action = vi.fn<RunbookAction>()
      .mockResolvedValueOnce({ ok: true, preview: { text: 'First sample.', bannedTerms: [] } })
      .mockResolvedValueOnce({ ok: true, preview: { text: 'Second sample.', bannedTerms: [] } })
      .mockResolvedValueOnce({ ok: false, error: LIMIT });
    render(<RunbookEditor data={data()} canEdit action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(region().textContent).toContain('First sample.'));
    fireEvent.click(screen.getByRole('radio', { name: /Formal/ }));
    expect(region().textContent).not.toContain('First sample.');
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(region().textContent).toContain('Second sample.'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(region().textContent).toContain(LIMIT));
    expect(region().textContent).not.toContain('Second sample.');
  });
});
