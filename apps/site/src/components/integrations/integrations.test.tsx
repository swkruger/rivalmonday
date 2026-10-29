import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ existsSync: vi.fn(() => false) }));
vi.mock('node:fs', () => ({ ...fs, default: fs }));

import { INTEGRATIONS, listedIntegrations, type Integration } from '../../../content/integrations';
import { IntegrationsStrip } from './integrations-strip';
import { VendorMark } from './vendor-mark';

afterEach(() => {
  cleanup();
  fs.existsSync.mockReset();
  fs.existsSync.mockReturnValue(false);
});

const by = (slug: string): Integration => INTEGRATIONS.find((i) => i.slug === slug)!;

describe('VendorMark', () => {
  it('text wordmark when no approved logo', () => {
    const { container } = render(<VendorMark integration={by('stripe')} size="strip" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Stripe').className).toContain('font-semibold');
  });

  it('logo only when verdict logo-ok, approved and file exists', () => {
    fs.existsSync.mockReturnValue(true);
    const unapproved = render(<VendorMark integration={{ ...by('neon'), brand: { ...by('neon').brand, approved: false } }} size="page" />);
    expect(unapproved.container.querySelector('img')).toBeNull();
    cleanup();
    const neon = { ...by('neon'), brand: { ...by('neon').brand, approved: true } };
    const ok = render(<VendorMark integration={neon} size="page" />);
    const img = ok.container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/logos/neon.svg');
    expect(img.getAttribute('alt')).toBe('Neon');
    cleanup();
    const textOnly = render(<VendorMark integration={by('stripe')} size="page" />);
    expect(textOnly.container.querySelector('img')).toBeNull();
    cleanup();
    fs.existsSync.mockReturnValue(false);
    const missing = render(<VendorMark integration={neon} size="page" />);
    expect(missing.container.querySelector('img')).toBeNull();
  });
});

describe('dropped vendor', () => {
  it('dropped vendor has no page params and no strip entry', async () => {
    const dropped = { ...by('sentry'), brand: { ...by('sentry').brand, verdict: 'drop' as const } };
    const rest = INTEGRATIONS.filter((i) => i.slug !== 'sentry');
    vi.resetModules();
    vi.doMock('../../../content/integrations', async (orig) => {
      const real = await orig<typeof import('../../../content/integrations')>();
      return { ...real, INTEGRATIONS: [...rest, dropped], listedIntegrations: () => [...rest, dropped].filter((i) => i.brand.verdict !== 'drop') };
    });
    try {
      const [{ generateStaticParams }, { IntegrationsStrip: Strip }] = await Promise.all([
        import('../../app/integrations/[vendor]/page'),
        import('./integrations-strip'),
      ]);
      expect(generateStaticParams().map((p) => p.vendor)).not.toContain('sentry');
      const { container } = render(<Strip />);
      expect(container.textContent).not.toContain('Sentry');
    } finally {
      vi.doUnmock('../../../content/integrations');
      vi.resetModules();
    }
  }, 20_000); // resetModules + cold dynamic imports are slow under parallel load

  it('the strip lists every listed vendor and links to the hub', () => {
    const { container } = render(<IntegrationsStrip />);
    expect(container.querySelector('section')!.id).toBe('integrations');
    for (const i of listedIntegrations()) expect(container.textContent).toContain(i.name);
    expect(screen.getByRole('link', { name: /See all integrations/ }).getAttribute('href')).toBe('/integrations');
  });
});
