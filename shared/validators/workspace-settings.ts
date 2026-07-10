import { z } from 'zod'

export const businessProfileSchema = z.object({
  businessName: z.string().max(200).default(''),
})

export const catalogKeywordMapSchema = z.record(
  z.string().min(1).max(120),
  z.array(z.string().min(1).max(80)).max(80),
)

export const lineTypeVerbsSchema = z.object({
  part: z.array(z.string().min(1).max(40)).max(120),
  labor: z.array(z.string().min(1).max(40)).max(120),
  fee: z.array(z.string().min(1).max(40)).max(120),
})

export const invoiceWorkspaceSettingsSchema = z.object({
  defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  shopSuppliesPercent: z.string().regex(/^\d+(\.\d{1,2})?$/).default('3.5'),
  managerApprovalThreshold: z.string().regex(/^\d+(\.\d{1,2})?$/).default('5000.00'),
})
