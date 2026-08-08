import { describe, expect, it } from 'vitest'
import {
  buildDocumentPrintedTeamMessageBody,
  buildStaplesPrintReadyTeamMessageBody,
} from '../../server/lib/print-team-notify.mjs'

describe('print team notify builders', () => {
  it('builds a local print message with an invoice entity ref', () => {
    const { body, refs } = buildDocumentPrintedTeamMessageBody({
      documentLabel: 'INV-000717',
      entityType: 'invoice',
      entityId: '11111111-1111-1111-1111-111111111111',
    })
    expect(body).toBe(
      '[[ref:invoice:11111111-1111-1111-1111-111111111111:INV-000717]] has been printed.',
    )
    expect(refs).toHaveLength(1)
    expect(refs[0]?.entityType).toBe('invoice')
  })

  it('builds a Staples ready message with a linked release code', () => {
    const { body, refs } = buildStaplesPrintReadyTeamMessageBody({
      jobId: '22222222-2222-2222-2222-222222222222',
      releaseCode: 'D6B189B6',
      documentLabel: 'INV-000717',
      entityType: 'invoice',
      entityId: '11111111-1111-1111-1111-111111111111',
    })
    expect(body).toContain('A new Staples print order has been made.')
    expect(body).toContain('[[ref:staples_print_job:22222222-2222-2222-2222-222222222222:D6B189B6]]')
    expect(body).toContain('[[ref:invoice:11111111-1111-1111-1111-111111111111:INV-000717]]')
    expect(refs.map(r => r.entityType)).toEqual(['staples_print_job', 'invoice'])
  })
})
