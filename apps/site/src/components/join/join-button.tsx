'use client';

import { Button } from '@cs/ui';
import { HERO } from '../../../content/home';
import { siteEnv } from '../../lib/env';
import { usePilot } from '../shell/pilot-context';
import { useJoin, type JoinStart } from './join-provider';

/** D14 primary CTA on ink (hero, closing bands): 12 px corners, 16/24 padding, the primary glow. Pass as `className`. */
export const JOIN_INK_CLASS = 'h-auto min-h-11 rounded-lg px-6 py-4 text-base font-semibold shadow-glow has-[>svg]:px-6 gap-2.5';

/**
 * Every join call to action. During the pilot it opens the join popup; with the pilot off, agency
 * CTAs become a link to the app's sign-up (the only place that switch lives). The business path
 * always uses the waitlist.
 */
export function JoinButton({ start, children, variant = 'primary', className }: { start?: JoinStart; children?: React.ReactNode; variant?: 'primary' | 'ghost'; className?: string }) {
  const { pilotMode } = usePilot();
  const { open } = useJoin();
  const buttonVariant = variant === 'primary' ? 'default' : 'ghost';

  if (!pilotMode && start !== 'business') {
    return (
      <Button asChild variant={buttonVariant} className={className}>
        <a href={`${siteEnv.appUrl}/sign-up`}>Start your free trial</a>
      </Button>
    );
  }
  return (
    <Button type="button" variant={buttonVariant} className={className} onClick={() => open(start)}>
      {children ?? HERO.primaryCta}
    </Button>
  );
}
