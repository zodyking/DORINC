import { describe, expect, it, vi } from 'vitest'
import {
  deleteImapByInternetMessageIds,
  deleteImapUids,
  internetMessageIdVariants,
  shouldDeleteUnmatchedPrintMeReply,
} from '../../server/workers/lib/staples-printme-imap-delete.mjs'

describe('staples printme imap delete helpers', () => {
  it('deletes only when PrintMe reply does not match an open job', () => {
    expect(shouldDeleteUnmatchedPrintMeReply({ matched: false, reason: 'no_job' })).toBe(true)
    expect(shouldDeleteUnmatchedPrintMeReply({ matched: false, reason: 'no_code' })).toBe(false)
    expect(shouldDeleteUnmatchedPrintMeReply({ matched: false, reason: 'not_printme' })).toBe(false)
    expect(shouldDeleteUnmatchedPrintMeReply({ matched: true, jobId: 'x' })).toBe(false)
    expect(shouldDeleteUnmatchedPrintMeReply(null)).toBe(false)
  })

  it('normalizes Message-ID variants for IMAP HEADER search', () => {
    expect(internetMessageIdVariants('<abc@printme.com>')).toEqual([
      '<abc@printme.com>',
      'abc@printme.com',
    ])
    expect(internetMessageIdVariants('abc@printme.com')).toEqual([
      'abc@printme.com',
      '<abc@printme.com>',
    ])
    expect(internetMessageIdVariants('  ')).toEqual([])
  })

  it('deletes unique UIDs via messageDelete', async () => {
    const client = {
      messageDelete: vi.fn(async () => true),
    }
    const deleted = await deleteImapUids(client as never, [10, '10', 11, null, 0, -1])
    expect(deleted).toBe(2)
    expect(client.messageDelete).toHaveBeenCalledWith([10, 11], { uid: true })
  })

  it('searches Message-ID variants then deletes found UIDs', async () => {
    const client = {
      search: vi.fn(async (query: { header: Record<string, string> }) => {
        const id = query.header['Message-ID']
        if (id === '<abc@printme.com>') return [42]
        return []
      }),
      messageDelete: vi.fn(async () => true),
    }

    const deleted = await deleteImapByInternetMessageIds(client as never, ['abc@printme.com'])
    expect(deleted).toBe(1)
    expect(client.messageDelete).toHaveBeenCalledWith([42], { uid: true })
  })
})
