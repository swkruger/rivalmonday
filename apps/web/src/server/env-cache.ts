import type { EnvName } from '@cs/db';
import { activeEnvName } from './dev-guard';

const caches: { clear(): Promise<void> }[] = [];

/**
 * Spec §5.4: one cached value per environment. With the guard off `activeEnvName()` is always 'dev', so there is
 * exactly one value, built from env as before.
 *
 * Final-review I1: pass `name` to get a named environment's value instead of the live one — a value built for one
 * environment must resolve its own dependencies by that name, never by re-reading `.dev-env.json` (the owner can
 * switch mid-request).
 */
export function perEnv<T>(build: (name: EnvName) => T, dispose?: (value: T) => unknown, active: () => EnvName = activeEnvName): (name?: EnvName) => T {
  const values = new Map<EnvName, T>();
  caches.push({
    async clear() {
      const old = [...values.values()];
      values.clear();
      if (dispose) await Promise.allSettled(old.map(async (v) => dispose(v)));
    },
  });
  return (explicit?: EnvName) => {
    const name = explicit ?? active();
    if (!values.has(name)) values.set(name, build(name));
    return values.get(name)!;
  };
}

/** Spec §5.2 switch step 2: drop every cached client set and store (pools are closed). */
export async function clearEnvCaches(): Promise<void> {
  await Promise.all(caches.map((c) => c.clear()));
}
