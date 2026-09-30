import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { type VerticalPack, verticalPackSchema } from './schema';

export const PACKS_DIR = fileURLToPath(new URL('../packs', import.meta.url));

export function parseVerticalPack(yamlText: string, source: string): VerticalPack {
  const result = verticalPackSchema.safeParse(parse(yamlText));
  if (!result.success) throw new Error(`Invalid vertical pack ${source}:\n${z.prettifyError(result.error)}`);
  return result.data;
}

export async function listVerticalPacks(dir: string = PACKS_DIR): Promise<string[]> {
  return (await readdir(dir)).filter((f) => f.endsWith('.yaml')).map((f) => f.slice(0, -'.yaml'.length)).sort();
}

export async function loadVerticalPack(id: string, dir: string = PACKS_DIR): Promise<VerticalPack> {
  if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(`Invalid vertical id: ${id}`);
  const file = join(dir, `${id}.yaml`);
  const pack = parseVerticalPack(await readFile(file, 'utf8'), file);
  if (pack.id !== id) throw new Error(`Vertical pack ${file} declares id "${pack.id}", expected "${id}"`);
  return pack;
}
