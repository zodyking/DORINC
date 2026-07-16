import { describe, expect, it, vi } from 'vitest'
import {
  ensureInvoiceNumberSequence,
  ensureServiceLogNumberSequence,
  syncInvoiceNumberSequence,
  syncNumberSequences,
} from '../../server/db/sync-sequences'

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

  it('skips setval when the sequence already points at MAX + 1', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ max_num: '711', seq_val: '711', seq_called: true }],
      }),
    }

    await ensureInvoiceNumberSequence(db as never)
    expect(db.execute).toHaveBeenCalledTimes(1)
  })

  it('runs setval when the invoice sequence is stale', async () => {
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({
          rows: [{ max_num: '711', seq_val: '760', seq_called: false }],
        })
        .mockResolvedValueOnce({ rows: [{ setval: '711' }] }),
    }

    await ensureInvoiceNumberSequence(db as never)
    expect(db.execute).toHaveBeenCalledTimes(2)
  })

  it('skips service log setval when the sequence already points at MAX + 1', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({
        rows: [{ max_num: '1007', seq_val: '1007', seq_called: true }],
      }),
    }

    await ensureServiceLogNumberSequence(db as never)
    expect(db.execute).toHaveBeenCalledTimes(1)
  })
})
