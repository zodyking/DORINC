import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_REQUESTED_TRIAGE_STATUSES,
  shouldPromoteCustomerRequestedLog,
} from '../../server/services/service-logs.service'

describe('shouldPromoteCustomerRequestedLog', () => {
  it('promotes customer-requested draft and uploaded logs only', () => {
    for (const status of CUSTOMER_REQUESTED_TRIAGE_STATUSES) {
      expect(shouldPromoteCustomerRequestedLog({ customerRequested: true, status })).toBe(true)
    }
    expect(shouldPromoteCustomerRequestedLog({ customerRequested: true, status: 'ready_for_review' })).toBe(false)
    expect(shouldPromoteCustomerRequestedLog({ customerRequested: false, status: 'draft' })).toBe(false)
  })
})
