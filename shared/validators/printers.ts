import { z } from 'zod'
import { PRINTER_IMAGE_CATEGORIES, PRINTER_SIDES, PRINTER_TABS, QUEUE_RE } from '../printers'

export const printersPageQuerySchema = z.object({
  tab: z.enum(PRINTER_TABS).optional().default('overview'),
})

export const addPrinterSchema = z.object({
  label: z.string().trim().min(1).max(100),
  queue: z.string().trim().regex(QUEUE_RE, 'Queue must begin with a letter and contain only letters, numbers, _ or -'),
  host: z.string().trim().min(7).max(15),
  authKey: z.string().optional().default(''),
  tailHostname: z.string().optional().default(''),
})

export const updatePrinterSchema = z.object({
  label: z.string().trim().min(1).max(100),
  host: z.string().trim().min(7).max(15),
  reread: z.boolean().optional().default(false),
})

export const printerOptionsSchema = z.object({
  options: z.record(z.string(), z.string()),
})

export const uploadPrintQuerySchema = z.object({
  queue: z.string().trim().regex(QUEUE_RE),
  sides: z.enum(PRINTER_SIDES).optional().default('one-sided'),
  copies: z.coerce.number().int().min(1).max(10).optional().default(1),
})

export const mailSettingsSchema = z.object({
  mail_enabled: z.boolean().optional().default(false),
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
  new_pin: z.string().optional(),
  email_pin: z.string().optional(),
  reply_enabled: z.boolean().optional(),
  smtp_from: z.string().optional(),
  smtp_host: z.string().optional(),
  smtp_port: z.coerce.number().int().min(1).max(65535).optional(),
  load_folders: z.boolean().optional(),
})

export const tailscaleActionSchema = z.object({
  action: z.enum(['join', 'leave']),
  auth_key: z.string().optional().default(''),
  hostname: z.string().optional().default(''),
})

export const imageActionSchema = z.object({
  action: z.enum(['apply', 'auto', 'search', 'preview', 'apply-preview']),
  illustration: z.enum(PRINTER_IMAGE_CATEGORIES).or(z.literal('')).optional(),
  choice: z.string().optional(),
})

export const queueParamSchema = z.object({
  queue: z.string().trim().regex(QUEUE_RE),
})

export const jobIdParamSchema = z.object({
  id: z.string().uuid(),
})
