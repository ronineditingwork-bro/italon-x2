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

// X2 Outdoor Lab: проекты посетителей (см. drizzle/0002_projects.sql и worker/projects.mjs)
export const outdoorProjects = sqliteTable('outdoor_projects', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  title: text('title').notNull(),
  kind: text('kind').notNull(),
  city: text('city').notNull().default(''),
  addressStatus: text('address_status').notNull(),
  addressJson: text('address_json').notNull().default('{}'),
  stateJson: text('state_json').notNull(),
  hasPhoto: integer('has_photo').notNull().default(0),
  hasResult: integer('has_result').notNull().default(0),
  photoConsent: integer('photo_consent').notNull().default(0),
  pdConsentAt: integer('pd_consent_at').notNull(),
  marketingConsent: integer('marketing_consent').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastViewAt: integer('last_view_at'),
  leadSentAt: integer('lead_sent_at'),
  deletedAt: integer('deleted_at'),
});
export const outdoorOtp = sqliteTable('outdoor_otp', {
  phone: text('phone').notNull(), codeHash: text('code_hash').notNull(), createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(), attempts: integer('attempts').notNull().default(0), usedAt: integer('used_at'),
});
export const outdoorSessions = sqliteTable('outdoor_sessions', { tokenHash: text('token_hash').primaryKey(), phone: text('phone').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull() });
export const outdoorShares = sqliteTable('outdoor_shares', {
  tokenHash: text('token_hash').primaryKey(), shareId: text('share_id').notNull(), projectId: text('project_id').notNull(), createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(), revokedAt: integer('revoked_at'), views: integer('views').notNull().default(0), lastViewAt: integer('last_view_at'),
});
export const outdoorHistory = sqliteTable('outdoor_history', { projectId: text('project_id').notNull(), at: integer('at').notNull(), event: text('event').notNull(), data: text('data').notNull().default('') });
