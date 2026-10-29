'use client';

import { Button, Wordmark } from '@cs/ui';
import { useEffect, useState } from 'react';
import { siteEnv } from '../../lib/env';
import { JoinButton } from '../join/join-button';
import { MobileMenu } from './mobile-menu';
import type { NavLink } from './nav-items';

/** `items` come from the server (`navItems()` in `nav-items.ts`): this client module never imports the page registry. */
export function SiteHeader({ items }: { items: NavLink[] }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-40 border-b border-line bg-surface ${scrolled ? 'shadow-overlay' : ''}`}>
      <div className="site-container flex h-16 items-center justify-between gap-4">
        <a href="/" aria-label="Rival Monday home" className="rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <Wordmark />
        </a>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {items.map((item) => (
            <a key={item.href} href={item.href} className="rounded-sm px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-muted-surface hover:text-ink">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 lg:flex">
            <Button asChild variant="ghost">
              <a href={`${siteEnv.appUrl}/sign-in`}>Sign in</a>
            </Button>
            <JoinButton />
          </div>
          <MobileMenu items={items} />
        </div>
      </div>
    </header>
  );
}
