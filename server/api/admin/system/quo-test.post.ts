import { z } from 'zod'
import { useDb } from '../../../db/client'
import {
  getQuoConfig,
  listQuoPhoneNumbers,
  refreshQuoConfigCache,
  testQuoConnection,
} from '../../../services/quo.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { normalizePhoneE164 } from '../../../../shared/format/phone-e164'

const bodySchema = z.object({
  /** Optional unsaved key so admins can load numbers before the first save. */
  apiKey: z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.string().trim().min(8).max(512).optional(),
  ),
}).optional().default({})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const db = useDb()
  await refreshQuoConfigCache(db)
  const body = await validateBody(event, bodySchema)
  const config = await getQuoConfig(db)
  const apiKey = body.apiKey?.trim() || config.apiKey

  if (!apiKey) {
    return {
      ok: false,
      phoneCount: 0,
      fromNumber: normalizePhoneE164(config.fromNumber) ?? (config.fromNumber || null),
      phoneNumbers: [],
      message: 'API key is not saved',
    }
  }

  // Prefer the shared helper when using the saved key (includes fromNumber context).
  if (!body.apiKey?.trim() || body.apiKey.trim() === config.apiKey) {
    return testQuoConnection(db)
  }

  try {
    const numbers = await listQuoPhoneNumbers(apiKey)
    return {
      ok: true,
      phoneCount: numbers.length,
      fromNumber: normalizePhoneE164(config.fromNumber) ?? (config.fromNumber || null),
      phoneNumbers: numbers,
      message: numbers.length
        ? `Connected — ${numbers.length} Quo number${numbers.length === 1 ? '' : 's'} found`
        : 'Connected — no phone numbers on this workspace yet',
    }
  }
  catch (err) {
    return {
      ok: false,
      phoneCount: 0,
      fromNumber: normalizePhoneE164(config.fromNumber) ?? (config.fromNumber || null),
      phoneNumbers: [],
      message: err instanceof Error ? err.message : 'Quo connection failed',
    }
  }
})
