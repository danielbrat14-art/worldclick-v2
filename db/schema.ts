import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const vocabulary = sqliteTable('vocabulary', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  wordKey: text('word_key').notNull(),
  payload: text('payload').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [uniqueIndex('idx_vocabulary_user_word').on(table.userId, table.wordKey)]);
export const lessons = sqliteTable('lessons', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  payload: text('payload').notNull(),
  revision: integer('revision').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('idx_lessons_user_updated').on(table.userId, table.updatedAt)]);
