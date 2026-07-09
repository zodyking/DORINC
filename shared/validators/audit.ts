import { z } from 'zod'
import { paginationSchema, uuidSchema } from './common'

export const auditCategorySchema = z.enum(['all', 'settings', 'users', 'backups', 'security'])

export const auditListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  entityType: z.string().trim().max(64).optional(),
  action: z.string().trim().max(128).optional(),
  actorUserId: uuidSchema.optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  category: auditCategorySchema.default('all'),
})

export type AuditListQuery = z.infer<typeof auditListQuerySchema>
