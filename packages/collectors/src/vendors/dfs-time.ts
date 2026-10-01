export function parseDfsTimestamp(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value !== 'string' || value.trim() === '') return null;
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/.exec(value.trim());
  const d = new Date(m ? `${m[1]}T${m[2]}${m[3]}` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}
