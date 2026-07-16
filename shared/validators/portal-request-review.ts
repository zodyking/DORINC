import { z } from 'zod'
import { moneySchema } from './common'
import { portalVehicleCorrectionInputSchema } from './portal'

export const PORTAL_REQUEST_REVIEW_KINDS = [
  'service',
  'invoice_change',
  'vehicle_change',
  'general',
  'new_vehicle',
] as const

export type PortalRequestReviewKind = (typeof PORTAL_REQUEST_REVIEW_KINDS)[number]

export const portalRequestReviewListQuerySchema = z.object({
  kind: z.enum(PORTAL_REQUEST_REVIEW_KINDS).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'all']).optional().default('pending'),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
})

export const portalLineItemCorrectionApplySchema = z.object({
  kind: z.literal('line_item'),
  description: z.string().trim().min(1).max(500),
  quantity: moneySchema,
  unitPrice: moneySchema,
})

export const portalVehicleCorrectionApplySchema = portalVehicleCorrectionInputSchema.extend({
  kind: z.literal('vehicle'),
})

export const portalCorrectionApplySchema = z.discriminatedUnion('kind', [
  portalLineItemCorrectionApplySchema,
  portalVehicleCorrectionApplySchema,
])

export const portalRequestApproveSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
  correctionApply: portalCorrectionApplySchema.optional(),
})

export const portalRequestRejectSchema = z.object({
  reason: z.string().trim().min(1, 'A rejection reason is required').max(2000),
})

export type PortalRequestReviewListQuery = z.infer<typeof portalRequestReviewListQuerySchema>
export type PortalRequestApproveInput = z.infer<typeof portalRequestApproveSchema>
export type PortalCorrectionApplyInput = z.infer<typeof portalCorrectionApplySchema>
export type PortalRequestRejectInput = z.infer<typeof portalRequestRejectSchema>
