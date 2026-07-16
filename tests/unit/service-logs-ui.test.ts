import { describe, expect, it } from 'vitest'
import {
  CUSTOMER_REQUESTED_TRIAGE_STATUSES,
  isServiceLogSendable,
  SERVICE_LOG_SENDABLE_STATUSES,
} from '../../app/utils/service-logs-ui'

describe('service-logs-ui sendable statuses', () => {
  it('treats ready_for_review and in_review as sendable', () => {
    expect(SERVICE_LOG_SENDABLE_STATUSES).toEqual(['ready_for_review', 'in_review'])
    expect(isServiceLogSendable('ready_for_review')).toBe(true)
    expect(isServiceLogSendable('in_review')).toBe(true)
    expect(isServiceLogSendable('uploaded')).toBe(false)
  })

  it('lists triage statuses for customer requests', () => {
    expect(CUSTOMER_REQUESTED_TRIAGE_STATUSES).toEqual(['draft', 'uploaded'])
  })
})
