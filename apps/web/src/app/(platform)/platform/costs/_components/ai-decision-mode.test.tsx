// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../actions', () => ({ setAiDecisionModeAction: vi.fn() }));
import { AiDecisionMode } from './ai-decision-mode';

afterEach(cleanup);
const NOW = new Date('2026-11-13T12:00:00Z');
const tasks = [{ task: 'tag_decisions', samples: 12, agreement: 0.9167, jevBelowTau: 0.25, llmUsd: 0.4 }, { task: 'page_decisions', samples: 0, agreement: null, jevBelowTau: null, llmUsd: 0 }];

describe('AiDecisionMode', () => {
  it('shows the mode, the active window date in the viewer zone, the stop button and the results table', () => {
    render(<AiDecisionMode now={NOW} tz="America/Chicago" data={{ mode: 'jev_only', reevalUntil: '2026-11-18T03:00:00Z', window: { from: '2026-11-11T03:00:00Z', to: NOW.toISOString(), tasks } }} />);
    expect((screen.getByLabelText('Jev only') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Jev with LLM backup') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Re-evaluating until Nov 17')).toBeTruthy(); // 03:00Z is still the 17th in Chicago
    expect(screen.getByRole('button', { name: 'Stop re-evaluation' })).toBeTruthy();
    for (const h of ['Task', 'Samples', 'Agreement', 'Jev unsure', 'LLM cost']) expect(screen.getByRole('columnheader', { name: h })).toBeTruthy();
    expect(screen.getByText('92%')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByText('$0.40')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('offers the start button when idle and hides the table without a window', () => {
    render(<AiDecisionMode now={NOW} tz="UTC" data={{ mode: 'cascade', reevalUntil: null, window: null }} />);
    expect((screen.getByLabelText('Jev with LLM backup') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Re-evaluate with all models for 7 days' })).toBeTruthy();
    expect(screen.queryByText(/Re-evaluating until/)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
