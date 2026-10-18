import 'server-only';
import { catalogOf } from '@cs/tools';
import { toolDeps } from './tools';

export interface VerticalOption {
  id: string;
  name: string;
  services: { id: string; name: string }[];
}

/** Selectable verticals from the DB catalogue (60 s TTL cache inside the catalogue). */
export async function verticalOptions(): Promise<VerticalOption[]> {
  const list = await catalogOf(toolDeps()).list();
  return list.map((v) => ({ id: v.id, name: v.name, services: v.services.map((s) => ({ id: s.id, name: s.name })) }));
}
