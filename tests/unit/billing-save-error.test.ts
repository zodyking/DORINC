import { describe, expect, it } from 'vitest'
import { syncFetchErrorMessage } from '../../app/utils/fetch-blob-error'

describe('billing save API errors', () => {
  it('reads standard API error bodies from fetch failures', () => {
    const err = {
      data: {
        code: 'INTERNAL_ERROR',
        message: 'Billing settings row was not updated',
        details: {},
        requestId: 'abc',
      },
    }
    expect(syncFetchErrorMessage(err, 'Save failed')).toBe('Billing settings row was not updated')
  })

  it('ignores generic Server Error status text in favor of fallback', () => {
    expect(syncFetchErrorMessage({ message: 'Server Error' }, 'Could not start QR upload'))
      .toBe('Could not start QR upload')
    expect(syncFetchErrorMessage({
      message: 'Server Error',
      data: { message: 'Vehicle not found — go back and pick a vehicle' },
    }, 'Could not start QR upload')).toBe('Vehicle not found — go back and pick a vehicle')
  })

  it('reads validation issues nested under details', () => {
    const payload = {
      message: 'Request validation failed',
      details: {
        issues: [{ path: 'domainRenewals.0.name', message: 'String must contain at least 3 character(s)' }],
      },
    }
    const issue = payload.details.issues.find(row => row.message)
    expect(issue?.path).toBe('domainRenewals.0.name')
    expect(`${issue?.path}: ${issue?.message}`).toContain('domainRenewals.0.name')
  })
})
