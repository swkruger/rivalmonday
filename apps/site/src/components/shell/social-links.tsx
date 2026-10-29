import { AtSign, Camera, Link2, Play, Users } from 'lucide-react';
import { siteEnv, type SocialNetwork } from '../../lib/env';

const NETWORKS: { key: SocialNetwork; name: string; Icon: typeof Link2 }[] = [
  { key: 'linkedin', name: 'LinkedIn', Icon: Link2 },
  { key: 'x', name: 'X', Icon: AtSign },
  { key: 'youtube', name: 'YouTube', Icon: Play },
  { key: 'facebook', name: 'Facebook', Icon: Users },
  { key: 'instagram', name: 'Instagram', Icon: Camera },
];

/** Generic glyphs (lucide dropped its brand icons); the aria-label names the network. Only networks with a configured `NEXT_PUBLIC_SOCIAL_*` link are shown. */
export function SocialLinks() {
  const shown = NETWORKS.filter((n) => siteEnv.social[n.key]);
  if (shown.length === 0) return null;
  return (
    <ul className="flex items-center gap-1">
      {shown.map(({ key, name, Icon }) => (
        <li key={key}>
          <a
            href={siteEnv.social[key] ?? undefined}
            target="_blank"
            rel="me noopener"
            aria-label={`Rival Monday on ${name}`}
            className="inline-flex size-9 items-center justify-center rounded-sm text-ink-secondary hover:bg-muted-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Icon className="size-4" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
