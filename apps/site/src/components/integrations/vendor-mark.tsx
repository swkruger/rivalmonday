import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Integration } from '../../../content/integrations';

/** True when its verdict allows a logo, the owner approved it in the ledger and the file is there. */
export const hasLogo = (integration: Integration) =>
  integration.brand.verdict === 'logo-ok' &&
  integration.brand.approved &&
  existsSync(join(process.cwd(), 'public/logos', `${integration.slug}.svg`));

/** The vendor's logo when `hasLogo` allows it; otherwise its name in plain type. */
export function VendorMark({ integration, size }: { integration: Integration; size: 'strip' | 'page' }) {
  if (hasLogo(integration)) {
    // Static SVG with its own aspect ratio; a fixed height keeps the row even.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/logos/${integration.slug}.svg`} alt={integration.name} className={size === 'page' ? 'h-9 w-auto' : 'h-6 w-auto'} />;
  }
  return <span className={`font-semibold text-ink ${size === 'page' ? 'text-2xl' : 'text-base'}`}>{integration.name}</span>;
}
