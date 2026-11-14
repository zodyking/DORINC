import { z } from 'zod'
import { IPV4_RE, PRINTER_IMAGE_CATEGORIES, PRINTER_PAGES, PRINTER_SIDES, QUEUE_RE } from '../printers'

const ipv4 = z.string().trim().regex(IPV4_RE, 'Enter the printer IPv4 address, such as 192.168.1.50')

export const printersPageQuerySchema = z.object({
  tab: z.enum(PRINTER_PAGES).optional().default('overview'),
})

export const addPrinterSchema = z.object({
  label: z.string().trim().min(1, 'Enter a printer name').max(100),
  host: ipv4,
  authKey: z.string().trim().max(300).optional().default(''),
})

export const updatePrinterSchema = z.object({
  label: z.string().trim().min(1, 'Enter a printer name').max(100),
  host: ipv4,
  reread: z.boolean().optional().default(false),
})

export const printerOptionsSchema = z.object({
  options: z.record(z.string(), z.string()),
})

export const mailSettingsSchema = z.object({
  mail_enabled: z.boolean().optional(),
  imap_host: z.string().optional(),
  imap_port: z.coerce.number().int().min(1).max(65535).optional(),
  imap_user: z.string().optional(),
  imap_password: z.string().optional(),
  imap_folder: z.string().optional(),
  default_queue: z.string().optional(),
  default_sides: z.enum(PRINTER_SIDES).optional(),
  max_pages: z.coerce.number().int().min(1).max(200).optional(),
  max_mb: z.coerce.number().int().min(1).max(30).optional(),
  max_files: z.coerce.number().int().min(1).max(10).optional(),
  poll_seconds: z.coerce.number().int().min(2).max(3600).optional(),
  print_email_body: z.boolean().optional(),
  allowed_senders: z.string().optional(),
  mail_recipient: z.string().optional(),
  email_pin: z.string().optional(),
  reply_enabled: z.boolean().optional(),
  smtp_from: z.string().optional(),
  smtp_host: z.string().optional(),
  smtp_port: z.coerce.number().int().min(1).max(65535).optional(),
  load_folders: z.boolean().optional(),
})

export const tailscaleActionSchema = z.object({
  action: z.enum(['join', 'leave']),
  auth_key: z.string().trim().max(300).optional().default(''),
})

export const queueParamSchema = z.object({
  queue: z.string().trim().regex(QUEUE_RE),
})

export const candidateParamSchema = z.object({
  kind: z.enum(['unifi', 'wiki']),
  item: z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/),
})

export const jobIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const imageSettingsSchema = z.object({
  action: z.enum(['save', 'refresh', 'rescan', 'clear']).optional().default('save'),
  images_auto: z.boolean().optional(),
})

export const IMAGE_ACTIONS = ['apply', 'auto', 'search', 'preview', 'apply-preview'] as const
export const imageIllustrationSchema = z.enum(PRINTER_IMAGE_CATEGORIES)

export const sendToPrinterSchema = z.object({
  kind: z.enum(['invoice', 'service-log-sheet']),
  queue: z.string().trim().regex(QUEUE_RE, 'Choose a printer'),
  invoiceIds: z.array(z.string().uuid()).max(100).optional().default([]),
  copies: z.coerce.number().int().min(1).max(10).optional().default(1),
  sides: z.enum(PRINTER_SIDES).optional().default('one-sided'),
}).refine(body => body.kind !== 'invoice' || body.invoiceIds.length > 0, {
  message: 'Choose an invoice to print',
  path: ['invoiceIds'],
})
