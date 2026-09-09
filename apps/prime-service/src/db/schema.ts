import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

// Placeholder table so the product database has an initial migration.
// Real PRIME (Project Requirements & Ident Material Engine) tables land here later.
export const placeholders = pgTable('placeholders', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: varchar('label', { length: 200 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
