import { useDb } from '../../db/client'
import { listCustomerEmailRecipients } from '../../services/email-inbox.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { z } from 'zod'

const querySchema = z.object({
  q: z.string().max(200).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'messages.send.own')
  const query = validateQuery(event, querySchema)
  const items = await listCustomerEmailRecipients(useDb(), query.q)
  return { items }
})
