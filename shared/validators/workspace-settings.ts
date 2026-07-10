import { z } from 'zod'

export const businessProfileSchema = z.object({
  businessName: z.string().max(200).default(''),
  phone: z.string().max(40).default(''),
  email: z.string().max(200).default(''),
  website: z.string().max(300).default(''),
  addressLine1: z.string().max(200).default(''),
  addressLine2: z.string().max(200).default(''),
  city: z.string().max(100).default(''),
  state: z.string().max(50).default(''),
  postalCode: z.string().max(20).default(''),
  country: z.string().max(60).default('US'),
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
