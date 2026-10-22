import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const carts = sqliteTable('carts', {
  id: text('id').primaryKey(),
  items: text('items').notNull().default('[]'),
  version: integer('version').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

export const quotes = sqliteTable('quotes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: integer('created_at').notNull(),
  customer: text('customer').notNull().default(''),
  phone: text('phone').notNull(),
  project: text('project').notNull().default(''),
  note: text('note').notNull().default(''),
  items: text('items').notNull(),
  totalKopecks: integer('total_kopecks').notNull(),
  telegramOk: integer('telegram_ok').notNull().default(0),
});
