import { z } from 'zod'
import { MESSAGE_ENTITY_TYPES } from '../../server/db/schema/messages'
import { paginationSchema, uuidSchema } from './common'

export const messageEntityRefSchema = z.object({
  entityType: z.enum(MESSAGE_ENTITY_TYPES),
  entityId: uuidSchema,
  entityLabel: z.string().trim().min(1).max(200),
})

export const createConversationSchema = z.object({
  participantUserId: uuidSchema,
})

export const conversationListQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  channel: z.enum(['all', 'dm', 'email']).default('dm'),
  emailScope: z.enum(['customers', 'all']).default('customers'),
})

export const messageListQuerySchema = paginationSchema.extend({
  afterId: uuidSchema.optional(),
})

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(8000),
  entityRefs: z.array(messageEntityRefSchema).max(20).optional(),
})

export const entitySearchQuerySchema = z.object({
  type: z.enum(MESSAGE_ENTITY_TYPES),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(10),
})

export const staffUsersQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
})

export type MessageEntityRefInput = z.infer<typeof messageEntityRefSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
