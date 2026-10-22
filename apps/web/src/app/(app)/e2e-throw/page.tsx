import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** E2E only (`E2E_THROW_PAGE=1`, set in the Playwright server env): a page that throws, to prove the shell survives. */
export default function E2eThrowPage(): never {
  if (process.env.E2E_THROW_PAGE !== '1' || process.env.VERCEL_ENV === 'production') notFound();
  throw new Error('e2e deliberate failure: secret detail');
}
