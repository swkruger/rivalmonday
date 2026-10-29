import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The CTA band needs the join provider, which is not part of what these tests check.
vi.mock('../home/cta-band', () => ({ CtaBand: () => null }));

import { SOURCES, SOURCES_PAGE } from '../../../content/sources';
import SourcePage from '../../app/sources/[source]/page';
import SourcesHub from '../../app/sources/page';
import { SourceIcon } from './source-icon';

afterEach(cleanup);

describe('sources pages', () => {
  it('no img elements on source pages', async () => {
    const hub = render(<SourcesHub />);
    expect(hub.container.querySelector('img')).toBeNull();
    cleanup();
    for (const s of SOURCES) {
      const { container } = render(await SourcePage({ params: Promise.resolve({ source: s.slug }) }));
      expect(container.querySelector('img'), s.slug).toBeNull();
      cleanup();
    }
  });

  it('trademark note on hub and item pages', async () => {
    const hub = render(<SourcesHub />);
    expect(hub.container.textContent).toContain(SOURCES_PAGE.trademarkNote);
    cleanup();
    for (const s of SOURCES) {
      const { container } = render(await SourcePage({ params: Promise.resolve({ source: s.slug }) }));
      expect(container.textContent, s.slug).toContain(SOURCES_PAGE.trademarkNote);
      cleanup();
    }
  });

  it('icons are aria-hidden inline svg', () => {
    for (const s of SOURCES) {
      const { container } = render(<SourceIcon icon={s.icon} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      cleanup();
    }
  });
});
