import {
  pgTable,
  serial,
  text,
  doublePrecision,
  timestamp,
} from 'drizzle-orm/pg-core';

export const sqlUsers = pgTable('sql_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tourVenues = pgTable('tour_venues', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => sqlUsers.id, { onDelete: 'cascade' }),
  placeId: text('place_id'),
  name: text('name').notNull(),
  formattedAddress: text('formatted_address'),
  category: text('category').notNull().default('Recording Studio'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  plannedDate: text('planned_date'),
  notes: text('notes'),
  googleMapsUri: text('google_maps_uri'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const studioCreations = pgTable('studio_creations', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => sqlUsers.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'music' | 'image' | 'video' | 'transcription'
  model: text('model').notNull(),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  outputText: text('output_text'),
  mimeType: text('mime_type'),
  metadataJson: text('metadata_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => sqlUsers.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull().default('default'),
  role: text('role').notNull(), // 'user' | 'model'
  model: text('model').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type SqlUser = typeof sqlUsers.$inferSelect;
export type TourVenueRow = typeof tourVenues.$inferSelect;
export type StudioCreationRow = typeof studioCreations.$inferSelect;
export type ChatMessageRow = typeof chatMessages.$inferSelect;
