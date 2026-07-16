import { describe, expect, it, vi } from 'vitest'
import { syncInvoiceNumberSequence, syncNumberSequences } from '../../server/db/sync-sequences'

describe('sync-sequences', () => {
  it('reads invoice setval from db.execute rows', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [{ setval: '711' }] }),
    }

    await expect(syncInvoiceNumberSequence(db as never)).resolves.toBe(711)
  })

  it('reads all sequence setvals from db.execute rows', async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ setval: '711' }] })
        .mockResolvedValueOnce({ rows: [{ setval: '1007' }] })
        .mockResolvedValueOnce({ rows: [{ setval: '42' }] }),
    }

    await expect(syncNumberSequences(db as never)).resolves.toEqual({
      invoiceNumber: 711,
      serviceLogNumber: 1007,
      estimateNumber: 42,
    })
  })
})
