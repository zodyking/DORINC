import { eq } from 'drizzle-orm'
import { useDb } from '../../db/client'
import { aiProviderSettings } from '../../db/schema/ai'
import { isBootstrapped } from '../../services/setup.service'
import { encryptBuffer } from '../../services/encryption.service'
import { ensureAiProviderSettings } from '../../services/ai-provider.service'
import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { setupAiSchema } from '../../../shared/validators/setup'

export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig()) {
    throw apiError(event, 'VALIDATION_ERROR', 'Configure the database in step 2 first')
  }

  const db = useDb()
  if (await isBootstrapped(db)) {
    throw apiError(event, 'CONFLICT', 'Setup is locked')
  }

  const body = await validateBody(event, setupAiSchema)
  const current = await ensureAiProviderSettings(db)

  await db.update(aiProviderSettings)
    .set({
      encryptedApiKey: encryptBuffer(Buffer.from(body.apiKey, 'utf8')),
      defaultModel: body.defaultModel,
      enabled: true,
      updatedAt: new Date(),
    })
    .where(eq(aiProviderSettings.id, current.id))

  return { ok: true, message: 'AI settings saved' }
})
