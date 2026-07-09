import { z } from 'zod'
import { emailSchema, nonEmptyString } from './common'

export const setupDatabaseSchema = z.object({
  host: nonEmptyString.max(255),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  database: nonEmptyString.max(120),
  username: nonEmptyString.max(120),
  password: z.string().max(500),
})

export type SetupDatabaseInput = z.infer<typeof setupDatabaseSchema>

export const setupSecuritySchema = z.object({
  masterKeyHex: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  sessionSecretHex: z.string().min(32).optional(),
  /** Optional when APP_URL is set in the environment (Dockploy). */
  appUrl: z.string().url().optional(),
  maxUploadMb: z.coerce.number().int().min(1).max(500).optional(),
})

export const setupSmtpSchema = z.object({
  host: nonEmptyString.max(255),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  username: z.string().max(255).default(''),
  password: z.string().max(500).default(''),
  from: nonEmptyString.max(255),
})

export const setupSmtpTestSchema = z.object({
  to: emailSchema,
  host: nonEmptyString.max(255),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  username: z.string().max(255).default(''),
  password: z.string().max(500).default(''),
  from: nonEmptyString.max(255),
})

export const setupAiSchema = z.object({
  apiKey: z.string().min(10).max(500),
  defaultModel: z.string().min(1).max(120).default('anthropic/claude-sonnet-4'),
})

export type SetupSecurityInput = z.infer<typeof setupSecuritySchema>
export type SetupSmtpInput = z.infer<typeof setupSmtpSchema>
