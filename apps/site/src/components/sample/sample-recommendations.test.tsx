import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { REC_COPY, SAMPLE_REC_META } from '../../../content/sample-recommendations';
import { SAMPLE } from '../../sample/schema';
import { SampleRecommendations } from './sample-recommendations';

const item = (id: string) => SAMPLE.items.find((i) => i.id === id)!;
const column = (name: string) => screen.getByRole('region', { name });
const title = (id: string) => item(id).recommendedAction;

describe('SampleRecommendations', () => {
  it('every item has its board details, and the board shows the brief\'s own wording', () => {
    expect(Object.keys(SAMPLE_REC_META).sort()).toEqual(SAMPLE.items.map((i) => i.id).sort());
    render(<SampleRecommendations />);
    expect(within(column('To do')).getByText(title('i1'))).toBeTruthy();
    expect(within(column('In progress')).getByText(title('i2'))).toBeTruthy();
    expect(within(column('Done')).getByText(title('i4'))).toBeTruthy();
    expect(screen.getByText(item('i1').whyItMatters)).toBeTruthy();
    expect(screen.getByText(REC_COPY.note)).toBeTruthy();
  });

  it('Start and Done move a card, it takes focus, and reset restores the board', () => {
    render(<SampleRecommendations />);
    fireEvent.click(screen.getByRole('button', { name: `Start ${title('i1')}` }));
    const moved = within(column('In progress')).getByText(title('i1')).closest('article')!;
    expect(document.activeElement).toBe(moved);
    expect(screen.getByText(`Moved to In progress: ${title('i1')}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `Mark ${title('i1')} done` }));
    expect(within(column('Done')).getByText(title('i1'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: REC_COPY.reset }));
    expect(within(column('To do')).getByText(title('i1'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: REC_COPY.reset })).toBeNull();
  });

  it('Reopen brings a done card back to in progress', () => {
    render(<SampleRecommendations />);
    fireEvent.click(screen.getByRole('button', { name: `Reopen ${title('i4')}` }));
    expect(within(column('In progress')).getByText(title('i4'))).toBeTruthy();
  });

  it('Dismiss needs a reason, then lists the card with it, and Reopen returns it to to-do', () => {
    render(<SampleRecommendations />);
    fireEvent.click(screen.getByRole('button', { name: `Dismiss ${title('i2')}` }));
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Dismiss' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(REC_COPY.reasonLabel), { target: { value: 'Already running a bundle' } });
    fireEvent.click(submit);
    expect(screen.getByText('Already running a bundle')).toBeTruthy();
    expect(screen.getByText(REC_COPY.dismissedLabel(1))).toBeTruthy();
    expect(within(column('In progress')).queryByText(title('i2'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Reopen ${title('i2')}` }));
    expect(within(column('To do')).getByText(title('i2'))).toBeTruthy();
  });

  it('an evidence pill opens the evidence sheet', () => {
    render(<SampleRecommendations />);
    const card = screen.getByText(title('i2')).closest('article')!;
    fireEvent.click(within(card).getAllByRole('button', { name: /^Evidence 1/ })[0]!);
    expect(screen.getByRole('dialog', { name: /kestrel-mechanical\.example/ })).toBeTruthy();
  });
});
