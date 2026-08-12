import { describe, expect, it } from 'vitest'
import {
  buildCatalogAuditFindings,
  catalogAuditFindingToFix,
} from '../../shared/catalog-audit'

const categories = [
  { id: 'cat-light', name: 'Lighting' },
  { id: 'cat-brake', name: 'Brakes' },
  { id: 'cat-engine', name: 'Engine' },
]

describe('buildCatalogAuditFindings', () => {
  it('flags wording mistakes using invoice prose formatting', () => {
    const findings = buildCatalogAuditFindings(
      [
        {
          id: '1',
          itemType: 'part',
          name: 'replace front right marker light',
          description: null,
          categoryId: 'cat-light',
          categoryName: 'Lighting',
          uom: 'each',
        },
      ],
      categories,
    )

    const row = findings.find(f => f.itemId === '1')
    expect(row?.kinds).toContain('wording')
    expect(row?.suggestedName).toBe('Replace R/Front Marker Light')
    expect(row?.selected).toBe(true)
    expect(row?.autoFixable).toBe(true)
  })

  it('auto-suggests part/labor type corrections from wording verbs', () => {
    const findings = buildCatalogAuditFindings(
      [
        {
          id: '2',
          itemType: 'labor',
          name: 'Install Air Filter',
          description: null,
          categoryId: 'cat-engine',
          categoryName: 'Engine',
          uom: 'hr',
        },
      ],
      categories,
    )

    const row = findings.find(f => f.itemId === '2')
    expect(row?.kinds).toContain('type')
    expect(row?.suggestedItemType).toBe('part')
    expect(row?.suggestedUom).toBe('each')
  })

  it('flags uncategorized items and suggests a category when possible', () => {
    const findings = buildCatalogAuditFindings(
      [
        {
          id: '3',
          itemType: 'part',
          name: 'Replace Brake Pads',
          description: null,
          categoryId: null,
          categoryName: null,
          uom: 'each',
        },
      ],
      categories,
    )

    const row = findings.find(f => f.itemId === '3')
    expect(row?.kinds).toContain('uncategorized')
    expect(row?.suggestedCategoryName).toBe('Brakes')
  })

  it('groups near-duplicate names for manual review', () => {
    const findings = buildCatalogAuditFindings(
      [
        {
          id: 'a',
          itemType: 'labor',
          name: 'Install Belts on Top of Seat',
          description: null,
          categoryId: null,
          categoryName: null,
          uom: 'hr',
        },
        {
          id: 'b',
          itemType: 'labor',
          name: 'Install All Belts On Top Of Seat',
          description: null,
          categoryId: null,
          categoryName: null,
          uom: 'hr',
        },
      ],
      categories,
    )

    const dup = findings.find(f => f.kinds.includes('duplicate'))
    expect(dup).toBeTruthy()
    expect(dup?.autoFixable).toBe(false)
    expect(dup?.selected).toBe(false)
    expect(dup?.duplicates.length).toBe(1)
  })
})

describe('catalogAuditFindingToFix', () => {
  it('builds an apply patch from suggested fields', () => {
    const findings = buildCatalogAuditFindings(
      [
        {
          id: '1',
          itemType: 'labor',
          name: 'install brake pads',
          description: null,
          categoryId: null,
          categoryName: null,
          uom: 'hr',
        },
      ],
      categories,
    )
    const row = findings.find(f => f.itemId === '1')!
    const fix = catalogAuditFindingToFix(row)
    expect(fix?.itemId).toBe('1')
    expect(fix?.name).toBe('Install Brake Pads')
    expect(fix?.itemType).toBe('part')
    expect(fix?.categoryId).toBe('cat-brake')
  })
})
