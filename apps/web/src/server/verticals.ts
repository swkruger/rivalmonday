import 'server-only';
import { listVerticalPacks, loadVerticalPack } from '@cs/verticals';

export interface VerticalOption {
  id: string;
  name: string;
  services: { id: string; name: string }[];
}

let cached: Promise<VerticalOption[]> | null = null;
/** Packs are static YAML bundled with the app; read them once per process. */
export function verticalOptions(): Promise<VerticalOption[]> {
  cached ??= (async () => {
    const ids = await listVerticalPacks();
    const packs = await Promise.all(ids.map((id) => loadVerticalPack(id)));
    return packs.map((p) => ({ id: p.id, name: p.name, services: p.services.map((s) => ({ id: s.id, name: s.name })) }));
  })();
  return cached;
}
