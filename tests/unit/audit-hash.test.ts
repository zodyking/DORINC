import { describe, expect, it } from 'vitest'
import {
  AUDIT_GENESIS_HASH,
  buildAuditHashPayload,
  computeAuditEntryHash,
  verifyAuditChainRows,
  verifyAuditEntryHash,
} from '../../shared/audit-hash'

describe('audit hash chain (P3-07)', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    entityType: 'customer',
    entityId: 'cust-1',
    action: 'customers.create',
    beforeData: null,
    afterData: { displayName: 'Acme' },
    changedFields: null,
    actorUserId: '22222222-2222-4222-8222-222222222222',
    actorName: 'Devon',
    actorEmail: 'devon@dorinc.local',
    actorAccountType: 'admin',
    permissionKey: 'customers.create',
    riskLevel: 'normal',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
    requestId: 'req-1',
    createdAt: '2026-07-08T12:00:00.000Z',
  }

  it('anchors the chain at a stable genesis hash', () => {
    expect(AUDIT_GENESIS_HASH).toHaveLength(64)
    expect(AUDIT_GENESIS_HASH).toMatch(/^[a-f0-9]+$/)
  })

  it('computes deterministic entry hashes from previous hash + payload', () => {
    const payload = buildAuditHashPayload(base)
    const hashA = computeAuditEntryHash(AUDIT_GENESIS_HASH, payload)
    const hashB = computeAuditEntryHash(AUDIT_GENESIS_HASH, payload)
    expect(hashA).toBe(hashB)
    expect(hashA).not.toBe(AUDIT_GENESIS_HASH)
  })

  it('verifies a valid two-entry chain', () => {
    const firstPayload = buildAuditHashPayload(base)
    const firstHash = computeAuditEntryHash(AUDIT_GENESIS_HASH, firstPayload)

    const secondPayload = buildAuditHashPayload({
      ...base,
      id: '33333333-3333-4333-8333-333333333333',
      action: 'customers.update',
      createdAt: '2026-07-08T12:01:00.000Z',
    })
    const secondHash = computeAuditEntryHash(firstHash, secondPayload)

    const result = verifyAuditChainRows([
      { ...firstPayload, previousHash: AUDIT_GENESIS_HASH, entryHash: firstHash },
      { ...secondPayload, previousHash: firstHash, entryHash: secondHash },
    ])

    expect(result.status).toBe('valid')
    expect(verifyAuditEntryHash({ ...firstPayload, previousHash: AUDIT_GENESIS_HASH, entryHash: firstHash })).toBe(true)
  })

  it('detects tampered entry hashes', () => {
    const payload = buildAuditHashPayload(base)
    const entryHash = computeAuditEntryHash(AUDIT_GENESIS_HASH, payload)

    const result = verifyAuditChainRows([
      { ...payload, previousHash: AUDIT_GENESIS_HASH, entryHash: `${entryHash.slice(0, -1)}0` },
    ])

    expect(result.status).toBe('broken')
    expect(result.brokenEntryId).toBe(base.id)
  })

  it('detects broken previous-hash links', () => {
    const firstPayload = buildAuditHashPayload(base)
    const firstHash = computeAuditEntryHash(AUDIT_GENESIS_HASH, firstPayload)
    const secondPayload = buildAuditHashPayload({
      ...base,
      id: '33333333-3333-4333-8333-333333333333',
      createdAt: '2026-07-08T12:01:00.000Z',
    })
    const wrongPrevious = 'deadbeef'.repeat(8)
    const secondHash = computeAuditEntryHash(wrongPrevious, secondPayload)

    const result = verifyAuditChainRows([
      { ...firstPayload, previousHash: AUDIT_GENESIS_HASH, entryHash: firstHash },
      { ...secondPayload, previousHash: wrongPrevious, entryHash: secondHash },
    ])

    expect(result.status).toBe('broken')
    expect(result.message).toMatch(/continuity/)
  })
})
