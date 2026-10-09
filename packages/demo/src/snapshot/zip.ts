import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { unzipSync, zipSync } from 'fflate';

/** Relative POSIX paths of every file under `dir` (empty for a missing directory). The one shared directory walker. */
export async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string, prefix: string) => {
    let names: string[];
    try {
      names = await readdir(d);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(d, name);
      if ((await stat(p)).isDirectory()) await walk(p, `${prefix}${name}/`);
      else out.push(`${prefix}${name}`);
    }
  };
  await walk(dir, '');
  return out;
}

/** Spec §6.1 step 3. Evidence directories are small (about 1 MB today), so an in-memory zip is fine. */
export async function zipDirectory(dir: string, outFile: string): Promise<{ files: number; bytes: number }> {
  const files = await listFiles(dir);
  const entries: Record<string, Uint8Array> = {};
  let bytes = 0;
  for (const f of files) {
    const body = new Uint8Array(await readFile(join(dir, ...f.split('/'))));
    entries[f] = body;
    bytes += body.byteLength;
  }
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, zipSync(entries, { level: 6 }));
  return { files: files.length, bytes };
}

export async function unzipTo(zipFile: string, dir: string): Promise<number> {
  const entries = unzipSync(new Uint8Array(await readFile(zipFile)));
  const root = resolve(dir);
  let n = 0;
  for (const [name, body] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const target = resolve(root, ...name.split('/'));
    if (!target.startsWith(root + sep)) throw new Error(`Unsafe path in evidence zip: ${name}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    n++;
  }
  return n;
}
