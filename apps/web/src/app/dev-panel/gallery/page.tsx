import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** App-style § 3.8: dev-only primitives gallery. 404 in production builds and whenever the dev-panel guard fails. */
export default async function GalleryPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const { DevGallery, galleryAllowed } = await import('@/dev-panel/gallery');
  if (!(await galleryAllowed())) notFound();
  return <DevGallery />;
}
