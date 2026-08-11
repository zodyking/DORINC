import { useDb } from '../../db/client'
import { buildDorincContactVcardBytes } from '../../services/dorinc-contact.service'

/**
 * Downloadable DORINC contact card (vCard) with Susan AI phone label + logo.
 * Quo API cannot attach MMS contact cards; iPhone users tap this link to Add Contact.
 */
export default defineEventHandler(async (event) => {
  const built = await buildDorincContactVcardBytes(useDb())
  if (!built) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Quo SMS number is not configured',
    })
  }

  setHeader(event, 'Content-Type', 'text/vcard; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${built.filename}"`)
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  return built.body
})
