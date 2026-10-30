import type { MetadataRoute } from 'next';
import { SITE_NAME, TITLE_STEM } from '../../content/site';
import { OG } from '../lib/og-theme';

export const dynamic = 'force-static';

/** Web app manifest: name, colours and the generated icons (`icon.tsx`, `apple-icon.tsx`). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: TITLE_STEM,
    start_url: '/',
    display: 'browser',
    background_color: OG.canvas,
    theme_color: OG.canvas,
    icons: [
      { src: '/icon', sizes: '64x64', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
