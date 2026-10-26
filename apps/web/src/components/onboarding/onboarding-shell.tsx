import { Wordmark } from '@cs/ui';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { StepProgress } from './step-progress';
// Lazy, like PageHeader: the guide sheet loads only on pages that have a guide.
const PageGuide = dynamic(() => import('@/components/help/page-guide').then((m) => m.PageGuide));

export type OnboardingBrand =
  | { kind: 'platform' }
  | { kind: 'neutral' }
  | { kind: 'agency'; name: string; logoUrl: string | null; style: React.CSSProperties };

export interface OnboardingShellProps {
  brand: OnboardingBrand;
  step?: { n: number; of: number; label: string };
  /** "Save and exit" top-right; `null` or absent hides it. */
  exit?: { href: string; label: string } | null;
  title: string;
  subtitle?: string;
  helpKey?: string;
  /** As `PageHeader`'s `guide`: a guide exists for this viewer (`helpGuides(...).has(helpKey)`). Without it no button shows. */
  guide?: boolean;
  preview?: React.ReactNode;
  caption?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * L7 split onboarding page (spec 16 §3): no app shell. Left 640px column (brand, exit, step progress, H1, form, pinned
 * footer); right canvas panel with one floating preview and a caption, hidden below 1024px (the left column then centres
 * at 560px). `logoUrl` is only ever `https` or `null` (`resolveBranding`). Agency brand: `style` carries the theme vars.
 */
export function OnboardingShell({ brand, step, exit, title, subtitle, helpKey, guide, preview, caption, footer, children }: OnboardingShellProps) {
  const showGuide = Boolean(helpKey && guide);
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[640px_1fr]" style={brand.kind === 'agency' ? brand.style : undefined}>
      <main className="mx-auto flex w-full max-w-[560px] flex-col px-6 pb-8 pt-9 lg:mx-0 lg:max-w-none lg:pl-[72px] lg:pr-16">
        <div className="flex items-center justify-between gap-4">
          {brand.kind === 'platform' ? (
            <Wordmark className="text-xl font-semibold" />
          ) : brand.kind === 'agency' ? (
            brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.name} className="h-8 w-auto" />
            ) : (
              <Wordmark name={brand.name} className="text-xl font-semibold" />
            )
          ) : <span />}
          <div className="flex items-center gap-4">
            {showGuide && <PageGuide helpKey={helpKey!} pageTitle={title} />}
            {exit && <Link href={exit.href} className="text-[13px] font-medium text-muted-ink hover:text-ink">{exit.label}</Link>}
          </div>
        </div>
        {step && <div className="mt-14"><StepProgress {...step} /></div>}
        <h1 className={`text-[30px] font-semibold leading-[1.2] tracking-[-0.015em] ${step ? 'mt-9' : 'mt-14'}`}>{title}</h1>
        {subtitle && <p className="mt-2.5 max-w-[460px] text-[15px] leading-normal text-muted-ink">{subtitle}</p>}
        <div className="mt-8 flex max-w-[440px] flex-col gap-5">{children}</div>
        {footer}
      </main>
      <aside aria-label="Preview" className="relative hidden items-center justify-center border-l border-line bg-canvas lg:flex">
        {preview}
        {caption && <p className="absolute inset-x-14 bottom-10 text-center text-[13px] text-muted-ink">{caption}</p>}
      </aside>
    </div>
  );
}
