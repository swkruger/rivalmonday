import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-24">
      <h1 className="text-section font-semibold text-ink">Page not found</h1>
      <p className="mt-3 text-ink">That page doesn&apos;t exist or has moved.</p>
      <p className="mt-6 flex gap-6">
        <Link href="/" className="underline">Home</Link>
        <Link href="/sample-brief" className="underline">Sample brief</Link>
      </p>
    </main>
  );
}
