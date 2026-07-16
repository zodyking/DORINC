import { describe, expect, it } from 'vitest'
import { portalInvoiceChangeRequestSchema } from '../../shared/validators/portal'

describe('portalInvoiceChangeRequestSchema', () => {
  it('accepts structured line item correction without free-text description', () => {
    const result = portalInvoiceChangeRequestSchema.safeParse({
      invoiceId: '550e8400-e29b-41d4-a716-446655440000',
      topic: 'Line item correction',
      lineItemCorrection: {
        lineItemId: '660e8400-e29b-41d4-a716-446655440001',
        description: 'Change Oil',
        quantity: '1.00',
        unitPrice: '55',
        notes: 'Why the increase in price?',
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.invoiceId).toBe('550e8400-e29b-41d4-a716-446655440000')
      expect(result.data.lineItemCorrection?.unitPrice).toBe('55')
    }
  })

  it('accepts structured vehicle correction without free-text description', () => {
    const result = portalInvoiceChangeRequestSchema.safeParse({
      invoiceId: '550e8400-e29b-41d4-a716-446655440000',
      topic: 'Vehicle information correction',
      vehicleCorrection: {
        unitNumber: '616',
        year: 2023,
        make: 'IC BUS',
        model: 'PB105',
        vin: '4DRBUC8N2PB781791',
        plate: null,
        notes: 'testing',
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects line correction without invoice id', () => {
    const result = portalInvoiceChangeRequestSchema.safeParse({
      topic: 'Line item correction',
      lineItemCorrection: {
        lineItemId: '660e8400-e29b-41d4-a716-446655440001',
        description: 'Change Oil',
        quantity: '1.00',
        unitPrice: '55',
      },
    })
    expect(result.success).toBe(false)
  })
})
