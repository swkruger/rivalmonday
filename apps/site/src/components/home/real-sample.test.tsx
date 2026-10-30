import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../shell/pilot-context', () => ({ usePilot: () => ({ pilotMode: true, status: null, loaded: true }) }));
vi.mock('../join/join-provider', () => ({ useJoin: () => ({ open: () => {} }) }));

import { REAL_SAMPLE_PREVIEW } from '../../../content/home';
import { SAMPLE } from '../../sample/schema';
import { weekStats } from '../sample/rank-map';
import { RealSample } from './real-sample';

describe('RealSample preview', () => {
  it('is a decorative illustration whose scorecard matches the sample', () => {
    const { container } = render(<RealSample />);
    const fig = container.querySelector('figure')!;
    expect(fig.getAttribute('aria-hidden')).toBe('true');
    const { top3, points } = weekStats(SAMPLE.rankGrid.weeks.at(-1)!.you);
    expect(fig.textContent).toContain(`${top3} of ${points} points`);
    expect(fig.textContent).toContain(`${SAMPLE.rivals.length}, ${SAMPLE.rivals.filter((r) => r.tier === 'top').length} of them top rivals`);
    expect(fig.textContent).toContain(REAL_SAMPLE_PREVIEW.note);
  });
});
