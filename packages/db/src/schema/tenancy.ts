import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const agency = pgTable('agency', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const client = pgTable(
  'client',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    verticalId: text('vertical_id').notNull(),
    features: jsonb('features').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index('client_agency_idx').on(t.agencyId)],
);

/** Global, public-data entity. Captured once, shared by every client that tracks it (spec §4.3). */
export const competitor = pgTable('competitor', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  domain: text('domain').unique(),
  placeId: text('place_id').unique(),
  createdAt: createdAt(),
});

export const clientCompetitor = pgTable(
  'client_competitor',
  {
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull().references(() => client.id, { onDelete: 'cascade' }),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.clientId, t.competitorId] }), index('client_competitor_agency_idx').on(t.agencyId)],
);
