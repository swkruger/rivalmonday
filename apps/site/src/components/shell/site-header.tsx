'use client';

import { Button, Wordmark } from '@cs/ui';
import { useEffect, useState } from 'react';
import { BUSINESS } from '../../../content/business';
import { siteEnv } from '../../lib/env';
import { JoinButton } from '../join/join-button';
import { AudienceSwitch } from './audience-switch';
import { MobileMenu } from './mobile-menu';
import type { NavLink } from './nav-items';
import { useSide } from './side-context';

/**
 * `menus` come from the server (`navMenus()` in `nav-items.ts`): this client module never imports the page registry.
 * The side comes from the address: home shows wordmark and Sign in; both-reader pages add the switch (a row of its own on phones).
 * Agency and business sides add the switch, their menu and a join button. The five-item agency menu does not fit beside the
 * switch, Sign in and the button below 1280 px, so from `lg` to `xl` it lives in the sheet; the switch, Sign in and the button stay in the bar.
 */
export function SiteHeader({ menus }: { menus: { agency: NavLink[]; business: NavLink[] } }) {
  const [scrolled, setScrolled] = useState(false);
  const side = useSide();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const sided = side === 'agency' || side === 'business';

  return (
    <header className={`sticky top-0 z-40 border-b border-line bg-surface ${scrolled ? 'shadow-overlay' : ''}`}>
      <div className="site-container flex min-h-16 flex-wrap items-center justify-between gap-x-4">
        <a href="/" aria-label="Rival Monday home" className="rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <Wordmark />
        </a>
        {sided && <AudienceSwitch className="hidden lg:block" />}
        {side === 'both' && <AudienceSwitch className="order-last w-full pb-2 lg:order-none lg:w-auto lg:pb-0" />}
        {sided && (
          <nav aria-label="Main" className="hidden items-center gap-1 xl:flex">
            {menus[side].map((item) => (
              <a key={item.href} href={item.href} className="inline-flex min-h-9 items-center whitespace-nowrap rounded-sm px-2 text-sm font-medium text-ink-secondary hover:bg-muted-surface hover:text-ink">
                {item.label}
              </a>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2">
          <div className={`items-center gap-2 ${sided ? 'hidden lg:flex' : 'flex'}`}>
            <Button asChild variant="ghost">
              <a href={`${siteEnv.appUrl}/sign-in`}>Sign in</a>
            </Button>
            {side === 'agency' && <JoinButton />}
            {side === 'business' && <JoinButton start="business">{BUSINESS.hero.primaryCta}</JoinButton>}
          </div>
          <MobileMenu menus={menus} />
        </div>
      </div>
    </header>
  );
}
