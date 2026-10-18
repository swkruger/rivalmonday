import { isUuid } from '@cs/core';
import { askMetadata, AskScreen } from './ask-screen';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return askMetadata();
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const QUESTION_MAX = 2000;
/** The evidence viewer's prefilled question for `?seed=`. */
const SEED_QUESTION = 'What does this tell us?';

export default async function AskPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ q?: string | string[]; seed?: string | string[] }> }) {
  const { clientId } = await params;
  const sp = await searchParams;
  const q = one(sp.q)?.trim().slice(0, QUESTION_MAX) || undefined;
  const seedRaw = one(sp.seed);
  const seed = seedRaw && isUuid(seedRaw) ? seedRaw : undefined;
  // `?q=` is sent once; `?seed=` alone only prefills the box. Either way the seed grounds the first question.
  const entry = {
    ...(q ? { initialQuestion: q, autoSend: true } : seed ? { initialQuestion: SEED_QUESTION } : {}),
    ...(seed ? { seedEvidenceId: seed } : {}),
  };
  return <AskScreen clientId={clientId} threadId={null} {...entry} />;
}
