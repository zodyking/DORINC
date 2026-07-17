import { useDb } from '../../../db/client'
import {
  MessagesServiceError,
  parseEntityRefsFromBody,
  sendMessage,
} from '../../../services/messages.service'
import {
  EmailInboxError,
  getConversationType,
  type OutboundAttachmentInput,
  replyToEmailThread,
} from '../../../services/email-inbox.service'
import { throwMessagesApiError } from '../../../utils/messages-api-errors'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { sendMessageSchema } from '../../../../shared/validators/messages'
import { emailReplySchema } from '../../../../shared/validators/email-inbox'
import { apiError, validationError } from '../../../utils/api-error'
import { isMultipartRequest, readEmailComposeForm } from '../../../utils/email-compose-form'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'messages.send.own')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  const type = await getConversationType(db, id)
  if (!type) throw apiError(event, 'NOT_FOUND', 'Conversation not found')

  if (type === 'email') {
    let replyBody: string
    let attachments: OutboundAttachmentInput[] = []
    if (isMultipartRequest(event)) {
      const form = await readEmailComposeForm(event)
      const parsed = emailReplySchema.safeParse({ body: form?.fields.body ?? '' })
      if (!parsed.success) throw validationError(event, parsed.error)
      replyBody = parsed.data.body
      attachments = form?.attachments ?? []
    }
    else {
      const body = await validateBody(event, emailReplySchema)
      replyBody = body.body
    }

    try {
      return await replyToEmailThread(db, id, user.id, replyBody, attachments)
    }
    catch (err) {
      if (err instanceof EmailInboxError) {
        if (err.code === 'NOT_CONFIGURED') throw apiError(event, 'SERVICE_UNAVAILABLE', 'SMTP is not configured')
        if (err.code === 'SEND_FAILED') throw apiError(event, 'UPSTREAM_ERROR', 'Email could not be sent')
        if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Conversation not found')
        if (err.code === 'ATTACHMENT_TOO_LARGE') throw apiError(event, 'VALIDATION_ERROR', 'An attachment exceeds the upload size limit')
        if (err.code === 'INVALID_ATTACHMENT') throw apiError(event, 'VALIDATION_ERROR', 'Only images and PDF attachments are allowed')
      }
      throw err
    }
  }

  if (isMultipartRequest(event)) {
    const form = await readEmailComposeForm(event)
    const rawBody = form?.fields.body ?? ''
    const attachments = form?.attachments ?? []
    if (!rawBody.trim() && !attachments.length) {
      throw apiError(event, 'VALIDATION_ERROR', 'Message or attachment is required')
    }
    const refs = parseEntityRefsFromBody(rawBody)

    try {
      return await sendMessage(db, id, user.id, rawBody, refs, attachments)
    }
    catch (e) {
      if (e instanceof MessagesServiceError) {
        throwMessagesApiError(
          event,
          e,
          e.code === 'ENTITY_NOT_FOUND'
            ? 'One or more referenced records could not be found'
            : 'Could not send message',
        )
      }
      const message = (e as Error).message
      if (message === 'ATTACHMENT_TOO_LARGE') {
        throw apiError(event, 'VALIDATION_ERROR', 'An attachment exceeds the upload size limit')
      }
      if (message === 'INVALID_ATTACHMENT') {
        throw apiError(event, 'VALIDATION_ERROR', 'Only image attachments are allowed in team chat')
      }
      throw e
    }
  }

  const body = await validateBody(event, sendMessageSchema)
  const refs = body.entityRefs?.length ? body.entityRefs : parseEntityRefsFromBody(body.body)

  try {
    return await sendMessage(db, id, user.id, body.body, refs)
  }
  catch (e) {
    if (e instanceof MessagesServiceError) {
      throwMessagesApiError(
        event,
        e,
        e.code === 'ENTITY_NOT_FOUND'
          ? 'One or more referenced records could not be found'
          : 'Could not send message',
      )
    }
    throw e
  }
})
