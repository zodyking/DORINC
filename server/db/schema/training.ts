import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { TrainingLessonStep } from '../../shared/training-catalog'
import { users } from './auth'

/** Reusable training modules — not tied to account type. */
export const trainingModules = pgTable('training_modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull().default('general'),
  icon: text('icon').notNull().default('book'),
  estimatedMinutes: integer('estimated_minutes').notNull().default(10),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublished: boolean('is_published').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('training_modules_published_idx').on(table.isPublished),
  index('training_modules_sort_idx').on(table.sortOrder),
])

export const trainingLessons = pgTable('training_lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id').notNull().references(() => trainingModules.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  steps: jsonb('steps').$type<TrainingLessonStep[]>().notNull().default([]),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('training_lessons_module_slug_idx').on(table.moduleId, table.slug),
  index('training_lessons_module_sort_idx').on(table.moduleId, table.sortOrder),
])

export const trainingAssignments = pgTable('training_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').notNull().references(() => trainingModules.id, { onDelete: 'cascade' }),
  assignedBy: uuid('assigned_by').references(() => users.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: text('status', { enum: TRAINING_ASSIGNMENT_STATUSES }).notNull().default('assigned'),
  /** When true, user is locked to training until completed. */
  locksAccess: boolean('locks_access').notNull().default(true),
  notes: text('notes'),
}, table => [
  uniqueIndex('training_assignments_user_module_idx').on(table.userId, table.moduleId),
  index('training_assignments_user_status_idx').on(table.userId, table.status),
  index('training_assignments_module_idx').on(table.moduleId),
])

export const trainingLessonProgress = pgTable('training_lesson_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').notNull().references(() => trainingAssignments.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id').notNull().references(() => trainingLessons.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, table => [
  uniqueIndex('training_lesson_progress_assignment_lesson_idx').on(table.assignmentId, table.lessonId),
  index('training_lesson_progress_user_idx').on(table.userId),
])
