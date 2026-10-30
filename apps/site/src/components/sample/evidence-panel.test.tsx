import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SAMPLE, type SampleEvidence } from '../../sample/schema';
import { EvidencePanel } from './evidence-panel';

const find = (pred: (e: SampleEvidence) => boolean) => Object.values(SAMPLE.evidence).find(pred)!;
const open = (ev: SampleEvidence) => {
  render(<EvidencePanel ev={ev} data={SAMPLE} onClose={() => {}} returnFocus={() => null} />);
  return screen.getByRole('dialog');
};

describe('EvidencePanel', () => {
  it('an ad shows as an ad: advertiser, copy, illustrative creative and headline', () => {
    const ad = find((e) => e.kind === 'ad' && /financ/i.test(e.headline));
    if (ad.kind !== 'ad') throw new Error('fixture');
    const dialog = open(ad);
    expect(within(dialog).getByText(ad.body)).toBeTruthy();
    expect(within(dialog).getByText(ad.headline)).toBeTruthy();
    expect(within(dialog).getByRole('img', { name: /air conditioning unit/ }).getAttribute('src')).toBe('/sample/ad-financing.webp');
    expect(dialog.textContent).toContain('ad images are illustrations');
  });

  it('a rival rank claim compares the earlier scan with this one', () => {
    const ev = find((e) => e.kind === 'rank' && !e.summary.startsWith('You:') && SAMPLE.items.some((i) => i.evidenceIds[0] === e.id));
    if (ev.kind !== 'rank') throw new Error('fixture');
    const dialog = open(ev);
    expect(dialog.textContent).toContain('31 of 49 points');
    expect(dialog.textContent).toContain('8 of 49 points');
  });

  it('every sheet shows the claim it backs, marked as matching, and the four-step trail', () => {
    const item = SAMPLE.items[1]!;
    const dialog = open(SAMPLE.evidence[item.evidenceIds[0]!]!);
    expect(within(dialog).getByText(item.whatChanged, { selector: 'blockquote' })).toBeTruthy();
    expect(within(dialog).getByText('Matches the evidence')).toBeTruthy();
    const steps = within(within(dialog).getByRole('region', { name: 'Evidence trail' })).getAllByRole('listitem');
    expect(steps.map((s) => s.querySelector('p')!.textContent)).toEqual(['Captured', 'Compared', 'Checked', 'Briefed']);
  });
});
