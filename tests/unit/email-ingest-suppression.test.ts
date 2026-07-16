import { describe, expect, it, vi } from 'vitest'
import { emailSuppressionCandidates as tsCandidates } from '../../server/services/email-ingest-suppression.service'
import {
  emailSuppressionCandidates as workerCandidates,
  suppressesInboundEmail as workerSuppressesInboundEmail,
} from '../../server/workers/lib/email-ingest-suppression.mjs'

describe('deleted email thread suppression', () => {
  const input = {
    internetMessageId: '<new@example.com>',
    inReplyTo: '<deleted@example.com>',
    references: '<root@example.com> <deleted@example.com>',
  }

  it('checks the message, parent, and unique reference IDs in both sync paths', () => {
    const expected = [
      '<new@example.com>',
      '<deleted@example.com>',
      '<root@example.com>',
    ]
    expect(tsCandidates(input)).toEqual(expected)
    expect(workerCandidates(input)).toEqual(expected)
  })

  it('propagates a matched tombstone to a newly seen reply', async () => {
    let call = 0
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => {
      call++
      if (call === 1) {
        return {
          rows: [{
          source_conversation_id: '11111111-1111-4111-8111-111111111111',
          counterpart_email: 'customer@example.com',
          subject: 'Deleted thread',
          deleted_by: null,
          deleted_at: new Date('2026-07-16T00:00:00Z'),
          }],
        }
      }
      return { rows: [] }
    })

    await expect(workerSuppressesInboundEmail({ query }, input)).resolves.toBe(true)
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[1]?.[1]?.[0]).toBe('<new@example.com>')
  })

  it('allows unrelated new threads', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }))
    await expect(workerSuppressesInboundEmail({ query }, {
      internetMessageId: '<unrelated@example.com>',
    })).resolves.toBe(false)
    expect(query).toHaveBeenCalledTimes(1)
  })
})
