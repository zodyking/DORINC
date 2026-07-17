import type { H3Event } from 'h3'
import type { MessagesServiceError } from '../services/messages.service'
import { apiError } from './api-error'

/** Map messages service errors to standard API error codes (avoid invalid codes → HTTP 500). */
export function throwMessagesApiError(event: H3Event, err: MessagesServiceError, fallbackMessage: string) {
  switch (err.code) {
    case 'ENTITY_NOT_FOUND':
    case 'NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Record not found')
    case 'FORBIDDEN':
      throw apiError(event, 'FORBIDDEN', 'You do not have access to this conversation')
    case 'SELF_DM':
      throw apiError(event, 'VALIDATION_ERROR', 'You cannot message yourself')
    case 'INVALID_PARTICIPANT':
      throw apiError(event, 'VALIDATION_ERROR', 'That user cannot receive messages')
    case 'DM_DISABLED':
      throw apiError(event, 'FORBIDDEN', 'Direct messaging is disabled for this workspace')
    default:
      throw apiError(event, 'VALIDATION_ERROR', fallbackMessage)
  }
}
