import { pathToFileURL } from 'node:url';
import { FACT_SOURCES, enabledRivals, type Rival } from '../content/compare';

const DAY_MS = 86_400_000;

/** One message per rival (or source it cites) whose facts were last checked more than `maxAgeDays` before `today`. */
export function findStaleFacts(rivals: readonly Rival[], today: Date, maxAgeDays = 90): string[] {
  const stale: string[] = [];
  const age = (iso: string): number => (today.getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / DAY_MS;
  for (const r of rivals) {
    const a = age(r.factsCheckedOn);
    if (!(a <= maxAgeDays)) {
      stale.push(`${r.slug}: facts checked ${r.factsCheckedOn} (${Number.isNaN(a) ? 'invalid date' : `${Math.floor(a)} days ago`}, max ${maxAgeDays})`);
    }
    const ids = new Set([...r.facts, ...r.pricing].map((f) => f.source));
    for (const c of Object.values(r.cells)) if (c.source) ids.add(c.source);
    for (const id of ids) {
      const src = FACT_SOURCES.find((s) => s.id === id);
      if (!src) stale.push(`${r.slug}: unknown source id ${id}`);
      else if (!(age(src.checkedOn) <= maxAgeDays)) stale.push(`${r.slug}: source ${id} checked ${src.checkedOn}, older than ${maxAgeDays} days`);
    }
  }
  return stale;
}

function main(): void {
  const rivals = enabledRivals();
  const stale = findStaleFacts(rivals, new Date());
  if (stale.length) {
    console.error(`check:facts failed:\n${stale.map((s) => `  - ${s}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`check:facts ok: ${rivals.length} enabled rival(s) [${rivals.map((r) => r.slug).join(', ')}] within 90 days`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
