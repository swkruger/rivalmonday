import { readFile, writeFile } from 'node:fs/promises';
import { BRIEF_LOCAL_HOUR, BRIEF_LOCAL_WEEKDAY } from '@cs/engine';
import { z } from 'zod';

/** Plan decision 1: every rehearsal client is in Chicago, so one local clock drives the whole week. */
export const REHEARSAL_TIMEZONE = 'America/Chicago';
export const REHEARSAL_MANIFEST_FILE = 'rehearsal-manifest.json';
export const REHEARSAL_ARCHIVE_FILE = 'rehearsal-archive.sh';
export const FAULT_AGENCY_NAME = 'Rehearsal Agency Fault';

const uuid = z.string().uuid();
export const RehearsalManifest = z.object({
  version: z.literal(1),
  seededAt: z.string().datetime(),
  /** `<host>/<db>` the seed wrote to. */
  database: z.string(),
  timezone: z.string(),
  /** The local Monday the rehearsal's weekly briefs are delivered on. */
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agencies: z.array(z.object({ id: uuid, name: z.string(), adminUserId: z.string() })),
  weeklyClientIds: z.array(uuid),
  startingPointClientIds: z.array(uuid),
  liveClientIds: z.array(uuid),
  fault: z.object({ agencyId: uuid, clientIds: z.array(uuid) }).optional(),
});
export type RehearsalManifest = z.infer<typeof RehearsalManifest>;

export async function readManifest(path: string): Promise<RehearsalManifest> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`No rehearsal manifest at ${path} (run \`rehearsal seed\` first, or pass --manifest)`);
  }
  return RehearsalManifest.parse(JSON.parse(raw));
}

export async function writeManifest(path: string, m: RehearsalManifest): Promise<void> {
  await writeFile(path, `${JSON.stringify(RehearsalManifest.parse(m), null, 2)}\n`, 'utf8');
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` plus `n` days. */
export const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

function offsetMs(at: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date(at)).map((x) => [x.type, x.value]),
  );
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - (at - (at % 1000));
}

/** The instant a local wall-clock time (`date` at `hour:minute` in `tz`) happens; DST-safe for times that exist. */
export function zonedTime(date: string, hour: number, minute: number, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  let t = wall - offsetMs(wall, tz);
  t = wall - offsetMs(t, tz);
  return new Date(t);
}

/** The local date (`YYYY-MM-DD`) of `at` in `tz`. */
export function localDate(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Thursday 22:00 local before delivery Monday `deliveryDate`: when that week's brief window opens. */
export const windowOpenFor = (deliveryDate: string, tz: string): Date =>
  zonedTime(addDays(deliveryDate, -((1 - BRIEF_LOCAL_WEEKDAY + 7) % 7)), BRIEF_LOCAL_HOUR, 0, tz);
