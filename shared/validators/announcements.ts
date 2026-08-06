import { z } from 'zod'
import { uuidSchema } from './common'

export const announcementCtaButtonSchema = z.object({
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(500),
  variant: z.enum(['primary', 'secondary', 'ghost']).optional(),
})

export const announcementTargetInputSchema = z.discriminatedUnion('targetType', [
  z.object({ targetType: z.literal('all') }),
  z.object({
    targetType: z.literal('account_type'),
    accountTypeKeys: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
  }),
  z.object({
    targetType: z.literal('user'),
    userIds: z.array(uuidSchema).min(1).max(500),
  }),
])

const announcementBodyHtmlSchema = z.string()
  .max(500_000, 'Message body is too large. Prefer the Image button or paste so images upload as files.')

export const announcementUpsertSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(300).nullable().optional(),
  bodyHtml: announcementBodyHtmlSchema.optional().default(''),
  heroImageFileId: uuidSchema.nullable().optional(),
  ctaButtons: z.array(announcementCtaButtonSchema).max(6).optional().default([]),
  isActive: z.boolean().optional().default(false),
  priority: z.coerce.number().int().min(-1000).max(1000).optional().default(0),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  audience: announcementTargetInputSchema,
})

export const announcementPatchSchema = announcementUpsertSchema.partial().extend({
  audience: announcementTargetInputSchema.optional(),
})

export type AnnouncementUpsertInput = z.infer<typeof announcementUpsertSchema>
export type AnnouncementPatchInput = z.infer<typeof announcementPatchSchema>
export type AnnouncementTargetInput = z.infer<typeof announcementTargetInputSchema>
export type AnnouncementCtaButtonInput = z.infer<typeof announcementCtaButtonSchema>
