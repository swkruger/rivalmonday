import 'server-only';
import { contact } from '@cs/db';
import { demoSignInLinks } from '@cs/demo/links';
import { eq } from 'drizzle-orm';
import { auth } from '@/server/auth';
import { dbs } from '@/server/db';
import { activeEnvName, devEnvFile, webRepoRoot, writeDevEnv } from '@/server/dev-guard';
import { devHooks } from '@/server/dev-hooks';
import { webEnv } from '@/server/env';
import { clearEnvCaches } from '@/server/env-cache';
import { createPanelHandler } from './handler';
import { captureMagicLink, devSignIn } from './sign-in';
import { spawnLines } from './spawn-lines';

/** The magic-link plugin's endpoint; the plugin list is widened in `auth.ts`, so its type is restated here. */
type MagicLinkApi = { signInMagicLink(a: { body: { email: string; callbackURL: string }; headers: Headers }): Promise<unknown> };

const COMMANDS = { reset: ['--filter', '@cs/demo', 'reset'], snapshot: ['--filter', '@cs/demo', 'snapshot'] } as const;

export const handleDevPanel = createPanelHandler({
  env: () => activeEnvName(),
  setEnv: (name) => writeDevEnv(devEnvFile(), name),
  clearCaches: clearEnvCaches,
  async links(name, origin) {
    if (name === 'dev') return [{ label: 'Sign-in page', url: `${origin}/sign-in` }];
    const links = await demoSignInLinks(dbs().service, { secret: webEnv().linkSecrets[0]!, baseUrl: origin });
    return links.map((l) => ({ label: l.label, email: l.email, url: l.url }));
  },
  run: (command, signal) => spawnLines('pnpm', [...COMMANDS[command]], webRepoRoot(), signal),
  signIn: (req, token) =>
    devSignIn(
      {
        env: () => activeEnvName(),
        secrets: () => webEnv().linkSecrets,
        async findContact(id) {
          const [c] = await dbs().service.select({ email: contact.email, userId: contact.userId, active: contact.active }).from(contact).where(eq(contact.id, id));
          return c ?? null;
        },
        // Controller ruling 3: the capture hook exists only for this call, inside the guarded sign-in route.
        startMagicLink: (email, request) =>
          captureMagicLink(devHooks, email, () => (auth().api as unknown as MagicLinkApi).signInMagicLink({ body: { email, callbackURL: '/' }, headers: request.headers })),
      },
      req,
      token,
    ),
});
