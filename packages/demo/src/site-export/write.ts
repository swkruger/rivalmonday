import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** `apps/site/content/<file>` as committed JSON: 2-space indent, LF, trailing newline. */
export async function writeSiteContent(repoRoot: string, file: string, data: unknown): Promise<void> {
  const path = join(repoRoot, 'apps', 'site', 'content', file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
