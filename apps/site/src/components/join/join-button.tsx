'use client';

import { Button } from '@cs/ui';
import { HERO } from '../../../content/home';
import { siteEnv } from '../../lib/env';
import { usePilot } from '../shell/pilot-context';
import { useJoin, type JoinStart } from './join-provider';

/**
 * Every join call to action. During the pilot it opens the join popup; with the pilot off, agency
 * CTAs become a link to the app's sign-up (the only place that switch lives). The business path
 * always uses the waitlist.
 */
export function JoinButton({ start, children, variant = 'primary' }: { start?: JoinStart; children?: React.ReactNode; variant?: 'primary' | 'ghost' }) {
  const { pilotMode } = usePilot();
  const { open } = useJoin();
  const buttonVariant = variant === 'primary' ? 'default' : 'ghost';

  if (!pilotMode && start !== 'business') {
    return (
      <Button asChild variant={buttonVariant}>
        <a href={`${siteEnv.appUrl}/sign-up`}>Start your free trial</a>
      </Button>
    );
  }
  return (
    <Button type="button" variant={buttonVariant} onClick={() => open(start)}>
      {children ?? HERO.primaryCta}
    </Button>
  );
}
