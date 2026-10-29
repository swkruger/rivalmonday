import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../home/cta-band', () => ({ CtaBand: () => null }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** resetModules + cold dynamic imports (pages, next/og) are slow under parallel load: give each test room. */
const COLD_IMPORT_TIMEOUT = 20_000;

async function load(env: string) {
  vi.stubEnv('NEXT_PUBLIC_COMPARE_PAGES', env);
  vi.resetModules();
  return {
    compare: await import('../../../content/compare'),
    pages: await import('../../../content/pages'),
    rivalPage: await import('../../app/compare/[rival]/page'),
    hub: await import('../../app/compare/page'),
    og: await import('../../app/compare/[rival]/opengraph-image'),
  };
}

describe('compare pages', { timeout: COLD_IMPORT_TIMEOUT }, () => {
  it('disabled slug is absent from params and PAGES', async () => {
    const m = await load('brightlocal');
    expect(m.rivalPage.generateStaticParams()).toEqual([{ rival: 'brightlocal' }]);
    expect(m.og.generateStaticParams()).toEqual([{ rival: 'brightlocal' }]);
    expect(m.rivalPage.dynamicParams).toBe(false);
    const paths = m.pages.PAGES.map((p) => p.path);
    expect(paths).toContain('/compare');
    expect(paths).toContain('/compare/brightlocal');
    expect(paths).not.toContain('/compare/birdeye');
    await expect(m.rivalPage.default({ params: Promise.resolve({ rival: 'birdeye' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('hub lists only enabled rivals and hides the list when none', async () => {
    const on = await load('brightlocal,visualping');
    const { container } = render(<on.hub.default />);
    const links = [...container.querySelectorAll('a[href^="/compare/"]')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/compare/brightlocal', '/compare/visualping']);
    expect(container.querySelectorAll('table th[scope="col"]').length).toBeGreaterThan(0);
    cleanup();
    const off = await load('');
    const r = render(<off.hub.default />);
    expect(r.container.textContent).not.toContain('Named comparisons');
    expect(r.container.querySelector('a[href^="/compare/"]')).toBeNull();
    expect(r.container.textContent).toContain(off.compare.COMPARE_COPY.corrections);
  });

  it('rival page shows facts checked date and trademark line', async () => {
    const m = await load('brightlocal');
    const r = m.compare.RIVALS.find((x) => x.slug === 'brightlocal')!;
    const { container } = render(await m.rivalPage.default({ params: Promise.resolve({ rival: 'brightlocal' }) }));
    const text = container.textContent!;
    expect(container.querySelector('h1')!.textContent).toBe(`Rival Monday vs ${r.name}`);
    expect(text).toContain(`Facts checked ${m.compare.formatFactDate(r.factsCheckedOn)}`);
    expect(text).toContain(m.compare.COMPARE_COPY.trademark(r.name));
    expect(text).toContain(m.compare.COMPARE_COPY.asOf(r.factsCheckedOn));
    expect(text).toContain(m.compare.COMPARE_COPY.corrections);
    expect(text).toContain(`Where ${r.name} is better`);
    for (const a of container.querySelectorAll('a[href^="https://"]')) expect(a.getAttribute('rel')).toBe('noopener nofollow');
  });

  it('unknown renders Not stated publicly, never a cross', async () => {
    const m = await load('rivalmappd');
    const r = m.compare.RIVALS.find((x) => x.slug === 'rivalmappd')!;
    expect(Object.values(r.cells).some((c) => c.mark === 'unknown')).toBe(true);
    const { container } = render(await m.rivalPage.default({ params: Promise.resolve({ rival: 'rivalmappd' }) }));
    expect(container.textContent).toContain('Not stated publicly');
    expect(container.textContent).not.toMatch(/[✗✘×❌]/);
    expect(container.querySelector('svg.lucide-x, svg.lucide-circle-x')).toBeNull();
  });
});

describe('SourceLink', () => {
  it('new-tab links announce "(opens in a new tab)" and keep the source name', async () => {
    const { SourceLink } = await import('./fact-list');
    const { getAllByRole } = render(
      <>
        <SourceLink id="bl-price" />
        <SourceLink id="bl-price" sup />
      </>,
    );
    const [plain, sup] = getAllByRole('link');
    for (const a of [plain!, sup!]) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('aria-label')).toBeNull();
      expect(a.querySelector('.sr-only:last-child')?.textContent).toBe(' (opens in a new tab)');
    }
    expect(plain!.textContent).toBe('Source: brightlocal.com (opens in a new tab)');
    expect(sup!.textContent).toBe('Source: [brightlocal.com] (opens in a new tab)');
  }, 20_000);
});
