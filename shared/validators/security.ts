import { z } from 'zod'

export const stepUpVerifySchema = z.object({
  password: z.string().min(1).max(200),
})

export const backupRestoreSchema = z.object({
  password: z.string().min(1).max(200),
  reason: z.string().trim().min(10).max(500),
})

export type StepUpVerifyInput = z.infer<typeof stepUpVerifySchema>
export type BackupRestoreInput = z.infer<typeof backupRestoreSchema>
