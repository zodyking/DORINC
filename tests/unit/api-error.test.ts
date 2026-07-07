import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  API_ERROR_STATUS,
  apiError,
  buildApiErrorBody,
  validationError,
} from '../../server/utils/api-error'

describe('api error shape', () => {
  it('builds the standard body', () => {
    const body = buildApiErrorBody('FORBIDDEN', 'Not allowed', { permission: 'invoices.send.all' }, 'req-1')
    expect(body).toEqual({
      code: 'FORBIDDEN',
      message: 'Not allowed',
      details: { permission: 'invoices.send.all' },
      requestId: 'req-1',
    })
  })

  it.each(Object.entries(API_ERROR_STATUS))('maps %s to status %i', (code, status) => {
    const err = apiError(null, code as keyof typeof API_ERROR_STATUS, 'x')
    expect(err.statusCode).toBe(status)
    expect(err.statusMessage).toBe(code)
  })

  it('carries { code, message, details, requestId } in data', () => {
    const event = { context: { requestId: 'req-42' } }
    const err = apiError(event as never, 'NOT_FOUND', 'Missing', { id: 'abc' })
    expect(err.data).toEqual({
      code: 'NOT_FOUND',
      message: 'Missing',
      details: { id: 'abc' },
      requestId: 'req-42',
    })
  })

  it('formats zod issues as VALIDATION_ERROR details', () => {
    const schema = z.object({ email: z.email(), qty: z.number().int() })
    const parsed = schema.safeParse({ email: 'nope', qty: 1.5 })
    expect(parsed.success).toBe(false)
    if (parsed.success) return

    const err = validationError(null, parsed.error)
    expect(err.statusCode).toBe(422)
    const data = err.data as { code: string, details: { issues: Array<{ path: string }> } }
    expect(data.code).toBe('VALIDATION_ERROR')
    const paths = data.details.issues.map(i => i.path)
    expect(paths).toContain('email')
    expect(paths).toContain('qty')
  })
})
