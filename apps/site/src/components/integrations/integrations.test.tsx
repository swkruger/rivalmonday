import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ existsSync: vi.fn(() => false) }));
vi.mock('node:fs', () => ({ ...fs, default: fs }));
vi.mock('../home/cta-band', () => ({ CtaBand: () => null }));

import { INTEGRATIONS, INTEGRATIONS_PAGE, listedIntegrations, type Integration } from '../../../content/integrations';
import IntegrationsPage from '../../app/integrations/page';
import { VendorMark } from './vendor-mark';

afterEach(() => {
  cleanup();
  fs.existsSync.mockReset();
  fs.existsSync.mockReturnValue(false);
});

const by = (slug: string): Integration => INTEGRATIONS.find((i) => i.slug === slug)!;

describe('VendorMark', () => {
  it('text wordmark when no approved logo', () => {
    const { container } = render(<VendorMark integration={by('stripe')} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Stripe').className).toContain('font-semibold');
  });

  it('logo only when verdict logo-ok, approved and file exists', () => {
    fs.existsSync.mockReturnValue(true);
    const unapproved = render(<VendorMark integration={{ ...by('neon'), brand: { ...by('neon').brand, approved: false } }} />);
    expect(unapproved.container.querySelector('img')).toBeNull();
    cleanup();
    const neon = { ...by('neon'), brand: { ...by('neon').brand, approved: true } };
    const ok = render(<VendorMark integration={neon} />);
    const img = ok.container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/logos/neon.svg');
    expect(img.getAttribute('alt')).toBe('Neon');
    cleanup();
    const textOnly = render(<VendorMark integration={by('stripe')} />);
    expect(textOnly.container.querySelector('img')).toBeNull();
    cleanup();
    fs.existsSync.mockReturnValue(false);
    const missing = render(<VendorMark integration={neon} />);
    expect(missing.container.querySelector('img')).toBeNull();
  });
});

describe('integrations page', () => {
  it('dropped vendor has no page params and no hub entry', async () => {
    const dropped = { ...by('sentry'), brand: { ...by('sentry').brand, verdict: 'drop' as const } };
    const rest = INTEGRATIONS.filter((i) => i.slug !== 'sentry');
    vi.resetModules();
    vi.doMock('../../../content/integrations', async (orig) => {
      const real = await orig<typeof import('../../../content/integrations')>();
      return { ...real, INTEGRATIONS: [...rest, dropped], listedIntegrations: () => [...rest, dropped].filter((i) => i.brand.verdict !== 'drop') };
    });
    try {
      const [{ generateStaticParams }, { default: Hub }] = await Promise.all([
        import('../../app/integrations/[vendor]/page'),
        import('../../app/integrations/page'),
      ]);
      expect(generateStaticParams().map((p) => p.vendor)).not.toContain('sentry');
      const { container } = render(<Hub />);
      expect(container.textContent).not.toContain('Sentry');
    } finally {
      vi.doUnmock('../../../content/integrations');
      vi.resetModules();
    }
  }, 20_000); // resetModules + cold dynamic imports are slow under parallel load

  it('the hub has the heading and links to every listed vendor', () => {
    render(<IntegrationsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'The services Rival Monday runs on' })).toBeTruthy();
    expect(screen.getByText(INTEGRATIONS_PAGE.lead)).toBeTruthy();
    for (const i of listedIntegrations()) {
      expect(screen.getByRole('link', { name: new RegExp(i.name) }).getAttribute('href')).toBe(`/integrations/${i.slug}`);
    }
  });
});
