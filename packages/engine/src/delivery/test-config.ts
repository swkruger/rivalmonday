import type { HostEnv } from '@cs/db';
import type { DeliveryConfig } from './outbox';
import type { SenderConfig } from './sender';

/** Tests only: the neutral domain every test sender uses (`<host_slug>@mail.clients.example`). */
export const TEST_NEUTRAL_DOMAIN = 'clients.example';
const hostEnvFor = (appUrl: string): HostEnv => ({ appUrl: appUrl.replace(/\/+$/, ''), neutralDomain: TEST_NEUTRAL_DOMAIN, extraPlatformHosts: [] });

/** Tests only: a `SenderConfig` (platform From `briefs@app.example` unless overridden). */
export function testSenderConfig(over: Partial<SenderConfig> = {}): SenderConfig {
  return { hostEnv: hostEnvFor('https://app.example'), platformFrom: 'briefs@app.example', ...over };
}

/** Tests only: a `DeliveryConfig`; the host env follows an overridden `appUrl` unless `hostEnv` is passed too. */
export function testDeliveryConfig(over: Partial<DeliveryConfig> = {}): DeliveryConfig {
  const appUrl = over.appUrl ?? 'https://app.example';
  return { appUrl, linkSecrets: ['s'.repeat(40)], hostEnv: hostEnvFor(appUrl), platformFrom: `briefs@${new URL(appUrl).hostname}`, ...over };
}
