import { useDb } from '../../db/client'
import {
  EmailInboxError,
  type OutboundAttachmentInput,
  startEmailThread,
} from '../../services/email-inbox.service'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { apiError, validationError } from '../../utils/api-error'
import { isMultipartRequest, readEmailComposeForm } from '../../utils/email-compose-form'
import { startEmailThreadSchema } from '../../../shared/validators/email-inbox'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.send.own')

  let body: { customerId?: string, toEmail: string, subject: string, body: string }
  let attachments: OutboundAttachmentInput[] = []
  if (isMultipartRequest(event)) {
    const form = await readEmailComposeForm(event)
    const parsed = startEmailThreadSchema.safeParse({
      customerId: form?.fields.customerId,
      toEmail: form?.fields.toEmail,
      subject: form?.fields.subject,
      body: form?.fields.body,
    })
    if (!parsed.success) throw validationError(event, parsed.error)
    body = parsed.data
    attachments = form?.attachments ?? []
  }
  else {
    body = await validateBody(event, startEmailThreadSchema)
  }

  try {
    return await startEmailThread(useDb(), user.id, body, attachments)
  }
  catch (err) {
    if (err instanceof EmailInboxError) {
      if (err.code === 'NOT_CONFIGURED') throw apiError(event, 'SERVICE_UNAVAILABLE', 'SMTP is not configured')
      if (err.code === 'INVALID_RECIPIENT') {
        throw apiError(
          event,
          'VALIDATION_ERROR',
          body.customerId
            ? 'That customer does not have an email address on file'
            : 'Enter a valid email address that is not already a customer on file',
        )
      }
      if (err.code === 'NOT_ALLOWED') {
        throw apiError(event, 'FORBIDDEN', 'You are not allowed to send email to non-customers')
      }
      if (err.code === 'SEND_FAILED') throw apiError(event, 'UPSTREAM_ERROR', 'Email could not be sent')
      if (err.code === 'ATTACHMENT_TOO_LARGE') throw apiError(event, 'VALIDATION_ERROR', 'An attachment exceeds the upload size limit')
      if (err.code === 'INVALID_ATTACHMENT') throw apiError(event, 'VALIDATION_ERROR', 'Only images and PDF attachments are allowed')
    }
    throw err
  }
})
