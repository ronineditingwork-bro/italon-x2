import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const carts = sqliteTable('carts', {
  id: text('id').primaryKey(),
  items: text('items').notNull().default('[]'),
  version: integer('version').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});
