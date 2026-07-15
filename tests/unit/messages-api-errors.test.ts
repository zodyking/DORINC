import { describe, expect, it } from 'vitest'
import { throwMessagesApiError } from '../../server/utils/messages-api-errors'
import { MessagesServiceError } from '../../server/services/messages.service'
import { API_ERROR_STATUS } from '../../server/utils/api-error'

describe('messages-api-errors', () => {
  it('maps invalid participant to validation error instead of HTTP 500', () => {
    try {
      throwMessagesApiError(
        null,
        new MessagesServiceError('INVALID_PARTICIPANT'),
        'fallback',
      )
      expect.unreachable('should throw')
    }
    catch (err) {
      const e = err as { statusCode?: number, data?: { code?: string } }
      expect(e.statusCode).toBe(API_ERROR_STATUS.VALIDATION_ERROR)
      expect(e.data?.code).toBe('VALIDATION_ERROR')
    }
  })

  it('maps entity not found to NOT_FOUND', () => {
    try {
      throwMessagesApiError(
        null,
        new MessagesServiceError('ENTITY_NOT_FOUND'),
        'fallback',
      )
      expect.unreachable('should throw')
    }
    catch (err) {
      const e = err as { statusCode?: number, data?: { code?: string } }
      expect(e.statusCode).toBe(API_ERROR_STATUS.NOT_FOUND)
    }
  })
})
