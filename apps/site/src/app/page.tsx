import { Hero } from '../components/home/hero';
import { pageMetadata } from '../lib/metadata';

export const metadata = pageMetadata('/');

/** Sections render in order: hero → sample → live → how-it-works → checks → friday → real-sample → founder → pricing → footer CTA (Task 11). */
export default function HomePage() {
  return (
    <main>
      <Hero />
    </main>
  );
}
