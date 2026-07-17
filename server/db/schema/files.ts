import { bigint, customType, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'

/** PostgreSQL bytea — Drizzle has no built-in type (SPEC §8). */
export const bytea = customType<{ data: Buffer, driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const FILE_OWNER_ENTITY_TYPES = ['service_log', 'invoice', 'estimate', 'customer', 'vehicle', 'request', 'template', 'company', 'message'] as const
export type FileOwnerEntityType = (typeof FILE_OWNER_ENTITY_TYPES)[number]

export const FILE_KINDS = ['original', 'preview', 'thumbnail', 'pdf', 'attachment', 'inline'] as const
export type FileKind = (typeof FILE_KINDS)[number]

/**
 * All live business files live in PostgreSQL bytea (SPEC §8).
 * Rules: no blobs in list queries, archive not delete, sha256 recorded.
 */
export const appFiles = pgTable('app_files', {
  id: uuid('id').primaryKey().defaultRandom(),

  ownerEntityType: text('owner_entity_type', { enum: FILE_OWNER_ENTITY_TYPES }).notNull(),
  ownerEntityId: uuid('owner_entity_id').notNull(),

  fileKind: text('file_kind', { enum: FILE_KINDS }).notNull().default('attachment'),
  // Thumbnails/previews link back to the file they were derived from (P1-14)
  sourceFileId: uuid('source_file_id'),

  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull(),
  sha256Hash: text('sha256_hash').notNull(),
  /** Content-ID for inline email images (cid: references in HTML). */
  documentCategory: text('document_category'),
  contentId: text('content_id'),

  width: integer('width'),
  height: integer('height'),

  binaryData: bytea('binary_data').notNull(),

  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('app_files_owner_idx').on(table.ownerEntityType, table.ownerEntityId),
  index('app_files_kind_idx').on(table.fileKind),
  index('app_files_source_idx').on(table.sourceFileId),
  index('app_files_archived_idx').on(table.archivedAt),
])
