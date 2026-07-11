import { z } from 'zod'
import { uuidSchema } from './common'

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #RRGGBB hex color')

export const invoiceTemplateDesignSettingsSchema = z.object({
  pageSize: z.enum(['Letter', 'A4']),
  marginInches: z.number().min(0.25).max(1.5),
  accentColor: hexColorSchema,
  accentColor2: hexColorSchema,
  fontSans: z.string().min(1).max(500),
  fontMono: z.string().min(1).max(500),
  logoFileId: uuidSchema.nullable().optional(),
  sections: z.record(z.string(), z.object({
    visible: z.boolean(),
    label: z.string().max(120).optional(),
  })).optional(),
})

export const publishInvoiceTemplateSchema = z.object({
  designSettings: invoiceTemplateDesignSettingsSchema,
})

export const previewTemplatePdfSchema = z.object({
  designSettings: invoiceTemplateDesignSettingsSchema.optional(),
})

export const duplicateInvoiceTemplateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
})

export const patchInvoiceTemplateSchema = z.object({
  isDefault: z.literal(true).optional(),
  name: z.string().trim().min(1).max(120).optional(),
}).refine(v => v.isDefault === true || v.name !== undefined, { message: 'No supported patch fields' })

export const testTemplatePdfSchema = z.object({
  designSettings: invoiceTemplateDesignSettingsSchema.optional(),
})
