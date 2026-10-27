import { cn, Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@cs/ui';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Fragment } from 'react';
import { FridayDockTrigger } from '@/components/ask/friday-dock-trigger';
// Lazy: the guide sheet (and the action behind it) loads only on pages that have a guide.
const PageGuide = dynamic(() => import('@/components/help/page-guide').then((m) => m.PageGuide));

/** One breadcrumb step; without `href` it renders as plain text. The last crumb is always the current page. */
export interface Crumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  /** Usually a string; a node when part of it is rendered with the viewer's names (`HelpText`). */
  description?: React.ReactNode;
  breadcrumb?: Crumb[];
  actions?: React.ReactNode;
  /** 15b-1: the page's guide key (`page:<slug>`). With `guide`, shows the "? Guide" button before the actions. */
  helpKey?: string;
  /** 15b-1: a guide exists for this viewer (`helpGuides(...).has(helpKey)`). Without it no button shows. */
  guide?: boolean;
  /** Wizards: "Step n of N" above the title. */
  step?: { n: number; of: number };
  /** Freshness line under the description ("Updated 2 hours ago"). */
  meta?: React.ReactNode;
  /** Underline tabs: under the title row (standard) or inline right of the title (compact). */
  tabs?: React.ReactNode;
  variant?: 'standard' | 'compact' | 'detail';
  /** `detail` only: rendered left of the title block (40px business avatar). Ignored otherwise. */
  avatar?: React.ReactNode;
}

/**
 * Spec §2.7: every page's single `<h1>` (the browser tab title is the page's `metadata.title`, which equals `title`),
 * an optional breadcrumb (`›` separators, last crumb `aria-current="page"`), description, and actions right-aligned
 * from `sm` up (stacked below it).
 */
export function PageHeader({ title, description, breadcrumb, actions, step, helpKey, guide, meta, tabs, avatar, variant = 'standard' }: PageHeaderProps) {
  const showGuide = Boolean(helpKey && guide);
  const compact = variant === 'compact';
  const withAvatar = variant === 'detail' && Boolean(avatar);
  return (
    <header data-slot="page-header" data-variant={variant} className="flex flex-col gap-2">
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList className="text-13">
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
      <div
        data-slot="page-header-row"
        className={cn('flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-4', compact ? 'sm:items-center' : 'sm:items-start')}
      >
        <div className={cn('min-w-0', compact && tabs && 'sm:flex sm:items-center sm:gap-6')}>
          <div className={cn('min-w-0', withAvatar && 'flex items-center gap-3')}>
            {withAvatar && avatar}
            <div className="min-w-0">
              {step && <p className="text-xs font-medium text-muted-ink">Step {step.n} of {step.of}</p>}
              <h1
                data-slot="page-title"
                className={cn('break-words font-semibold tracking-[-0.01em]', compact ? 'text-lg leading-7' : 'text-2xl leading-8')}
              >
                {title}
              </h1>
              {description && <p className="mt-1 max-w-[70ch] text-sm text-muted-ink">{description}</p>}
              {meta && <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-ink">{meta}</div>}
            </div>
          </div>
          {compact && tabs}
        </div>
        {/* 16d P6: "Ask {assistant}" (renders nothing outside a client page with the Friday dock) before the page's actions. */}
        {actions || showGuide ? (
          <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
            {showGuide && <PageGuide helpKey={helpKey!} pageTitle={title} />}
            <FridayDockTrigger />
            {actions}
          </div>
        ) : (
          <FridayDockTrigger />
        )}
      </div>
      {!compact && tabs}
    </header>
  );
}
