import { describe, expect, it } from 'vitest'
import {
  buildCategorySortProposals,
  buildCommonlyBilledCandidates,
  catalogMatchKey,
  catalogMatchKeyLoose,
  catalogNameFromInvoiceDescription,
  matchesExistingCatalogItem,
} from '../../shared/catalog-ai'

const categories = [
  { id: 'cat-light', name: 'Lighting' },
  { id: 'cat-brake', name: 'Brakes' },
  { id: 'cat-engine', name: 'Engine' },
  { id: 'cat-shop', name: 'Shop Supplies' },
]

describe('catalogMatchKey / catalogNameFromInvoiceDescription', () => {
  it('strips side abbreviations before matching', () => {
    expect(catalogMatchKey('Replace Air Filter R/S')).toBe('replace air filter')
    expect(catalogMatchKey('Replace Air Filter L/S')).toBe('replace air filter')
    expect(catalogMatchKey('Front Right marker light')).toBe('marker light')
  })

  it('builds a clean title-cased catalog name', () => {
    expect(catalogNameFromInvoiceDescription('replace air filter r/s')).toBe('Replace Air Filter')
    expect(catalogNameFromInvoiceDescription('Repair L/S door seal')).toBe('Repair Door Seal')
  })

  it('loose keys ignore filler words like all/the', () => {
    expect(catalogMatchKeyLoose('Install All Belts On Top Of Seat'))
      .toBe(catalogMatchKeyLoose('Install Belts on Top of Seat'))
    expect(catalogMatchKeyLoose('Clean Inside Of Bus')).toBe('clean bus')
  })
})

describe('matchesExistingCatalogItem', () => {
  it('matches near-duplicate catalog names', () => {
    const catalog = [{ id: '1', name: 'Install Belts on Top of Seat', description: null, sku: null }]
    const keys = new Set([catalogMatchKey(catalog[0]!.name)])
    const loose = new Set([catalogMatchKeyLoose(catalog[0]!.name)])
    const tokens = [catalogMatchKeyLoose(catalog[0]!.name).split(' ')]

    expect(matchesExistingCatalogItem(
      'Install All Belts On Top Of Seat',
      keys,
      loose,
      tokens,
    )).toBe(true)

    expect(matchesExistingCatalogItem(
      'Replace Air Filter R/S',
      keys,
      loose,
      tokens,
    )).toBe(false)
  })
})

describe('buildCategorySortProposals', () => {
  it('suggests categories for uncategorized items', () => {
    const proposals = buildCategorySortProposals(
      [
        {
          id: '1',
          name: 'Replace F/R Marker Light',
          description: null,
          categoryId: null,
          categoryName: null,
        },
        {
          id: '2',
          name: 'Install front brake pads',
          description: null,
          categoryId: null,
          categoryName: null,
        },
        {
          id: '3',
          name: 'Already categorized',
          description: 'brake pad',
          categoryId: 'cat-brake',
          categoryName: 'Brakes',
        },
      ],
      categories,
      null,
      { uncategorizedOnly: true },
    )

    expect(proposals.map(p => p.itemId).sort()).toEqual(['1', '2'])
    expect(proposals.find(p => p.itemId === '1')?.suggestedCategoryName).toBe('Lighting')
    expect(proposals.find(p => p.itemId === '2')?.suggestedCategoryName).toBe('Brakes')
  })
})

describe('buildCommonlyBilledCandidates', () => {
  it('groups side variants and excludes existing catalog items', () => {
    const { candidates, totalMatched } = buildCommonlyBilledCandidates(
      [
        { id: 'a', description: 'Replace Air Filter R/S', lineType: 'part', unitPrice: '45.00', catalogItemId: null },
        { id: 'b', description: 'Replace Air Filter L/S', lineType: 'part', unitPrice: '47.00', catalogItemId: null },
        { id: 'c', description: 'Replace Air Filter', lineType: 'part', unitPrice: '46.00', catalogItemId: null },
        { id: 'd', description: 'Adjust All Brakes', lineType: 'labor', unitPrice: '40.00', catalogItemId: null },
        { id: 'e', description: 'Adjust All Brakes', lineType: 'labor', unitPrice: '40.00', catalogItemId: null },
        { id: 'f', description: 'Shop supplies', lineType: 'fee', unitPrice: '12.00', catalogItemId: null },
      ],
      [
        { id: 'existing', name: 'Adjust All Brakes', description: null, sku: null },
      ],
      categories,
      { minOccurrences: 2, unlinkedOnly: true },
    )

    expect(candidates.map(c => c.matchKey)).toEqual(['replace air filter'])
    expect(totalMatched).toBe(1)
    expect(candidates[0]!.occurrenceCount).toBe(3)
    expect(candidates[0]!.name).toBe('Replace Air Filter')
    expect(candidates[0]!.suggestedItemType).toBe('part')
    expect(candidates[0]!.suggestedPrice).toBe('46.00')
  })

  it('excludes near-duplicate catalog names with filler words', () => {
    const { candidates } = buildCommonlyBilledCandidates(
      [
        { id: 'a', description: 'Install All Belts On Top Of Seat', lineType: 'labor', unitPrice: '55.00', catalogItemId: null },
        { id: 'b', description: 'Install All Belts On Top Of Seat', lineType: 'labor', unitPrice: '55.00', catalogItemId: null },
        { id: 'c', description: 'Complete Lube', lineType: 'labor', unitPrice: '45.00', catalogItemId: null },
        { id: 'd', description: 'Complete Lube', lineType: 'labor', unitPrice: '45.00', catalogItemId: null },
        { id: 'e', description: 'Brand New Service', lineType: 'labor', unitPrice: '20.00', catalogItemId: null },
        { id: 'f', description: 'Brand New Service', lineType: 'labor', unitPrice: '20.00', catalogItemId: null },
      ],
      [
        { id: '1', name: 'Install Belts on Top of Seat', description: null, sku: null },
        { id: '2', name: 'Complete Lube', description: null, sku: null },
      ],
      categories,
      { minOccurrences: 2, unlinkedOnly: true },
    )

    expect(candidates.map(c => c.name)).toEqual(['Brand New Service'])
  })

  it('skips linked catalog lines when unlinkedOnly is true', () => {
    const { candidates } = buildCommonlyBilledCandidates(
      [
        { id: 'a', description: 'Custom Widget', lineType: 'part', unitPrice: '10.00', catalogItemId: 'x' },
        { id: 'b', description: 'Custom Widget', lineType: 'part', unitPrice: '10.00', catalogItemId: 'x' },
      ],
      [],
      categories,
      { minOccurrences: 2, unlinkedOnly: true },
    )
    expect(candidates).toEqual([])
  })

  it('respects a higher result limit', () => {
    const lines = Array.from({ length: 60 }, (_, i) => ([
      {
        id: `a${i}`,
        description: `Unique Service ${i}`,
        lineType: 'labor' as const,
        unitPrice: '10.00',
        catalogItemId: null,
      },
      {
        id: `b${i}`,
        description: `Unique Service ${i}`,
        lineType: 'labor' as const,
        unitPrice: '10.00',
        catalogItemId: null,
      },
    ])).flat()

    const { candidates, totalMatched } = buildCommonlyBilledCandidates(
      lines,
      [],
      categories,
      { minOccurrences: 2, limit: 200, unlinkedOnly: true },
    )

    expect(totalMatched).toBe(60)
    expect(candidates).toHaveLength(60)
  })
})
