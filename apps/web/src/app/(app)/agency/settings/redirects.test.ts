import { describe, expect, it } from 'vitest';
import config from '../../../../../next.config';

/** Spec §2.6 (D15): the six agency pages that moved under `/agency/settings/` keep their old URLs as permanent redirects. */
describe('next.config redirects (15a route moves)', () => {
  it('maps every old agency path, sub-paths included, permanently', async () => {
    const redirects = await config.redirects!();
    expect(redirects).toEqual([
      { source: '/agency/team/:path*', destination: '/agency/settings/team/:path*', permanent: true },
      { source: '/agency/branding/:path*', destination: '/agency/settings/branding/:path*', permanent: true },
      { source: '/agency/webhooks/:path*', destination: '/agency/settings/slack-teams/:path*', permanent: true },
      { source: '/agency/ai/:path*', destination: '/agency/settings/ai/:path*', permanent: true },
      { source: '/agency/usage/:path*', destination: '/agency/settings/usage/:path*', permanent: true },
      { source: '/agency/playbooks/:path*', destination: '/agency/settings/playbooks/:path*', permanent: true },
    ]);
  });

  it('points every redirect at an existing settings page', async () => {
    const { existsSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    for (const r of await config.redirects!()) {
      const dir = r.destination.replace('/agency/settings/', '').replace('/:path*', '');
      expect(existsSync(join(here, dir, 'page.tsx')), r.destination).toBe(true);
    }
  });
});
