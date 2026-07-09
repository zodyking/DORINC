import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appSettings } from '../db/schema/settings'

export const MANAGER_APPROVAL_THRESHOLD_KEY = 'billing.manager_approval_threshold'
export const DEFAULT_MANAGER_APPROVAL_THRESHOLD = '5000.00'

export interface ManagerApprovalSettings {
  threshold: string
  enabled: boolean
}

export async function getManagerApprovalThreshold(db: Db): Promise<string> {
  const [row] = await db.select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, MANAGER_APPROVAL_THRESHOLD_KEY))
    .limit(1)

  const raw = row?.value as { amount?: string } | null
  const amount = raw?.amount?.trim()
  if (amount && /^\d+(\.\d{1,2})?$/.test(amount)) return amount
  return DEFAULT_MANAGER_APPROVAL_THRESHOLD
}

export async function getManagerApprovalSettings(db: Db): Promise<ManagerApprovalSettings> {
  const threshold = await getManagerApprovalThreshold(db)
  return { threshold, enabled: true }
}
