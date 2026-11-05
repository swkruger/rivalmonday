import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** App-style § 3.8: dev-only primitives gallery. The import sits inside a positive non-production branch so a production build drops it; a failed request guard 404s too. */
export default async function GalleryPage() {
  if (process.env.NODE_ENV !== 'production') {
    const { DevGallery, galleryAllowed } = await import('@/dev-panel/gallery');
    if (await galleryAllowed()) return <DevGallery />;
  }
  notFound();
}
