import {
  isPresetBladeMarker,
  parsePresetSlugFromMarker,
} from '../../../shared/invoice-template-blade'
import { resolveBladeSourceForEditor } from '../../utils/invoice-blade-baseline'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'templates.read.all')
  const query = getQuery(event)
  const marker = typeof query.marker === 'string' ? query.marker : ''

  if (marker && isPresetBladeMarker(marker) && !parsePresetSlugFromMarker(marker)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid invoice template preset marker' })
  }

  try {
    const source = await resolveBladeSourceForEditor(marker || 'laravel-blade:invoices/pdf')
    return { source }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load Blade source'
    if (message.includes('Unknown invoice template preset')) {
      throw createError({ statusCode: 404, statusMessage: message })
    }
    throw createError({ statusCode: 500, statusMessage: message })
  }
})
