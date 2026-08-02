import { describe, expect, it } from 'vitest'
import { authErrorMessage } from '../../app/utils/auth-errors'

describe('authErrorMessage', () => {
  it('explains signup password length validation', () => {
    const err = {
      data: {
        message: 'Request validation failed',
        details: {
          issues: [{ path: 'password', message: 'String must contain at least 12 character(s)' }],
        },
      },
    }
    expect(authErrorMessage(err)).toBe('Password must be at least 12 characters')
  })

  it('falls back to the API message when there are no field issues', () => {
    const err = {
      data: {
        message: 'An account with this email already exists',
      },
    }
    expect(authErrorMessage(err)).toBe('An account with this email already exists')
  })
})
