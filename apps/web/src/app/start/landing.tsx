import { PRIVACY_URL } from '@/lib/links';
import type { IntakeBrand } from './brand';
import { IntakeForm } from './intake-form';
import { IntakeShell, Panel } from './shell';

/** `/start` and `/start/<slug>`: the same form; only the platform page carries the L4 line. */
export function IntakeLanding({ brand, slug, refCode, siteKey, preview = false }: { brand: IntakeBrand; slug: string | null; refCode: string | null; siteKey: string | null; preview?: boolean }) {
  // Embedded in the agency preview, the page's own PageHeader owns the h1.
  const Heading = preview ? 'h2' : 'h1';
  return (
    <IntakeShell brand={brand} embedded={preview}>
      <div className="flex flex-col gap-2">
        <Heading className="text-2xl font-bold">Get your free competitor snapshot</Heading>
        <p className="text-muted-foreground">See how your business compares with nearby competitors on Google.</p>
        {brand.kind === 'platform' && <p className="text-muted-foreground">We&apos;ll match you with a local marketing partner.</p>}
      </div>
      <Panel>
        <IntakeForm slug={slug} refCode={refCode} siteKey={siteKey} preview={preview} privacyUrl={brand.kind === 'platform' ? PRIVACY_URL : null} />
      </Panel>
    </IntakeShell>
  );
}
