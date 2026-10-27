import { PRIVACY_URL } from '@/lib/links';
import type { IntakeBrand } from './brand';
import { IntakeFlow } from './intake-form';

/** `/start` and `/start/<slug>`: the same 3-step flow; only the platform page carries the L4 line and the privacy link. */
export function IntakeLanding({ brand, slug, refCode, siteKey, preview = false }: { brand: IntakeBrand; slug: string | null; refCode: string | null; siteKey: string | null; preview?: boolean }) {
  return <IntakeFlow brand={brand} slug={slug} refCode={refCode} siteKey={siteKey} preview={preview} privacyUrl={brand.kind === 'platform' ? PRIVACY_URL : null} />;
}
