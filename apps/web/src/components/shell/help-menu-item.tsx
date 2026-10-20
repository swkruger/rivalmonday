'use client';

import { DropdownMenuItem } from '@cs/ui';
import Link from 'next/link';
import { type SwitcherProps, useHelpHref } from './context-switcher';

/** 15b-1: the avatar menu's "Help", pointing at the Help page of the live context (`useNavContext`, shared with the sidebar). */
export function HelpMenuItem(p: SwitcherProps) {
  return (
    <DropdownMenuItem asChild>
      <Link href={useHelpHref(p)}>Help</Link>
    </DropdownMenuItem>
  );
}
