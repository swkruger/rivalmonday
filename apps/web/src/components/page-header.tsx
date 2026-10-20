import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@cs/ui';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Fragment } from 'react';
// Lazy: the guide sheet (and the action behind it) loads only on pages that have a guide.
const PageGuide = dynamic(() => import('@/components/help/page-guide').then((m) => m.PageGuide));

/** One breadcrumb step; without `href` it renders as plain text. The last crumb is always the current page. */
export interface Crumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: Crumb[];
  actions?: React.ReactNode;
  /** 15b-1: the page's guide key (`page:<slug>`). With `guide`, shows the "? Guide" button before the actions. */
  helpKey?: string;
  /** 15b-1: a guide exists for this viewer (`helpGuides(...).has(helpKey)`). Without it no button shows. */
  guide?: boolean;
  /** Wizards: "Step n of N" above the title. */
  step?: { n: number; of: number };
}

/**
 * Spec §2.7: every page's single `<h1>` (the browser tab title is the page's `metadata.title`, which equals `title`),
 * an optional breadcrumb (`›` separators, last crumb `aria-current="page"`), description, and actions right-aligned
 * from `sm` up (stacked below it).
 */
export function PageHeader({ title, description, breadcrumb, actions, step, helpKey, guide }: PageHeaderProps) {
  const showGuide = Boolean(helpKey && guide);
  return (
    <header className="flex flex-col gap-2">
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumb.map((crumb, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <Fragment key={`${i}-${crumb.label}`}>
                  {i > 0 && <BreadcrumbSeparator />}
                  {/* A crumb can be user text with no break point (an Ask thread title holding a URL): it shrinks and truncates, never widening the page. */}
                  <BreadcrumbItem className="min-w-0 max-w-full">
                    {last ? (
                      <BreadcrumbPage className="min-w-0 truncate" title={crumb.label}>{crumb.label}</BreadcrumbPage>
                    ) : crumb.href ? (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href} className="min-w-0 truncate" title={crumb.label}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <span className="min-w-0 truncate" title={crumb.label}>{crumb.label}</span>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {step && (
            <p className="text-sm font-semibold text-muted-ink">
              Step {step.n} of {step.of}
            </p>
          )}
          <h1 className="text-[26px] font-extrabold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-muted-ink">{description}</p>}
        </div>
        {(actions || showGuide) && (
          <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
            {showGuide && <PageGuide helpKey={helpKey!} pageTitle={title} />}
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
