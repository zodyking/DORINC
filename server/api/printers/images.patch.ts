import { useDb } from '../../db/client'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { apiError } from '../../utils/api-error'
import { imageSettingsSchema } from '../../../shared/validators/printers'
import {
  clearPrinterImageCache,
  PrintError,
  publicSettings,
  refreshImageCatalog,
  rescanPrinterImages,
  saveImageSettings,
} from '../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const body = await validateBody(event, imageSettingsSchema)
  try {
    if (body.action === 'refresh') {
      await refreshImageCatalog(useDb())
      return { ok: true }
    }
    if (body.action === 'clear') {
      await clearPrinterImageCache(useDb())
      return { ok: true }
    }
    if (body.action === 'rescan') {
      await rescanPrinterImages(useDb())
      return { ok: true }
    }
    const settings = await saveImageSettings(useDb(), body)
    return { ok: true, settings: publicSettings(settings) }
  }
  catch (err) {
    if (err instanceof PrintError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    throw apiError(event, 'UPSTREAM_ERROR', err instanceof Error ? err.message : 'Could not update printer images')
  }
})
