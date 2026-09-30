import type { z } from 'zod';

export interface JobDefinition<T> {
  name: string;
  schema: z.ZodType<T>;
  handler: (data: T) => Promise<void>;
  /** Optional cron schedule (UTC), registered with pg-boss schedule(). */
  cron?: string;
}

export function defineJob<T>(def: JobDefinition<T>): JobDefinition<T> {
  return def;
}
