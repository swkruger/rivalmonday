import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Integration } from '../../../content/integrations';

/** True when its verdict allows a logo, the owner approved it in the ledger and the file is there. */
export const hasLogo = (integration: Integration) =>
  integration.brand.verdict === 'logo-ok' &&
  integration.brand.approved &&
  existsSync(join(process.cwd(), 'public/logos', `${integration.slug}.svg`));

/** The vendor's logo when `hasLogo` allows it; otherwise its name in plain type. */
export function VendorMark({ integration }: { integration: Integration }) {
  if (hasLogo(integration)) {
    // Static SVG with its own aspect ratio; a fixed height keeps the row even.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/logos/${integration.slug}.svg`} alt={integration.name} className="h-9 w-auto" />;
  }
  return <span className="text-2xl font-semibold text-ink">{integration.name}</span>;
}
