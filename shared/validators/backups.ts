import { z } from 'zod'

export const backupSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  scheduleCron: z.string().trim().max(120).nullable().optional(),
  retentionDaily: z.number().int().min(1).max(365).optional(),
  retentionWeekly: z.number().int().min(1).max(52).optional(),
  retentionMonthly: z.number().int().min(1).max(60).optional(),
  storageMode: z.enum(['database', 'google_drive', 'both']).optional(),
  notifyEmail: z.string().trim().email().nullable().optional(),
})

export type BackupSettingsPatch = z.infer<typeof backupSettingsPatchSchema>
