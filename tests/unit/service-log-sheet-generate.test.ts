import { describe, expect, it } from 'vitest'
import {
  ensureQrVoid,
  groupCandidatesByCategory,
  groupCandidatesByClassicSections,
  matchClassicSectionTitle,
  packSectionsIntoDocument,
  rankSheetDemandCandidates,
  scoreSheetDemandCandidate,
  selectCandidatesForSheetCapacity,
  sheetGenerationFitSummary,
  type SheetDemandCandidate,
} from '../../shared/service-log-sheet-generate'
import { SHEET_FRONT_PAGE_ROW_CAPACITY } from '../../shared/service-log-sheet-layout'

function candidate(partial: Partial<SheetDemandCandidate> & { catalogItemId: string, name: string }): SheetDemandCandidate {
  const occurrenceCount = partial.occurrenceCount ?? 10
  const itemType = partial.itemType ?? 'labor'
  return {
    catalogItemId: partial.catalogItemId,
    name: partial.name,
    description: partial.description ?? null,
    price: partial.price ?? '$35',
    itemType,
    categoryName: partial.categoryName ?? 'Services',
    occurrenceCount,
    score: partial.score ?? scoreSheetDemandCandidate({ occurrenceCount, itemType }),
  }
}

describe('scoreSheetDemandCandidate', () => {
  it('scores higher for more frequent billing', () => {
    expect(scoreSheetDemandCandidate({ occurrenceCount: 50, itemType: 'part' }))
      .toBeGreaterThan(scoreSheetDemandCandidate({ occurrenceCount: 5, itemType: 'part' }))
  })

  it('down-weights fees vs parts/labor', () => {
    expect(scoreSheetDemandCandidate({ occurrenceCount: 20, itemType: 'part' }))
      .toBeGreaterThan(scoreSheetDemandCandidate({ occurrenceCount: 20, itemType: 'fee' }))
  })
})

describe('matchClassicSectionTitle', () => {
  it('maps shop names onto classic DORINC sections', () => {
    expect(matchClassicSectionTitle('Clean Inside Bus')).toBe('Cleaning')
    expect(matchClassicSectionTitle('Replace Signal Light Bulb')).toBe('Lights')
    expect(matchClassicSectionTitle('Replace Rear Brake Light Bulb')).toBe('Lights')
    expect(matchClassicSectionTitle('Adjust All Brakes')).toBe('Brakes and Hub Seals')
    expect(matchClassicSectionTitle('Replace Fuel Filter')).toBe('Filters')
    expect(matchClassicSectionTitle('Replace MaxxForce Oil Filter')).toBe('MaxxForce Diagnostics')
    expect(matchClassicSectionTitle('Replace Front Tire')).toBe('Tires')
    expect(matchClassicSectionTitle('Inspection Service')).toBe('Inspection')
    expect(matchClassicSectionTitle('Repair Entrance Door')).toBe('Body and Doors')
  })
})

describe('selectCandidatesForSheetCapacity', () => {
  it('keeps a dense capacity-safe subset of ranked items', () => {
    const ranked = rankSheetDemandCandidates(
      Array.from({ length: 80 }, (_, i) => candidate({
        catalogItemId: `id-${i}`,
        name: `Service ${i}`,
        occurrenceCount: 80 - i,
        categoryName: i % 2 ? 'Lights' : 'Brakes',
      })),
    )
    const selected = selectCandidatesForSheetCapacity(ranked)
    expect(selected.length).toBeGreaterThanOrEqual(28)
    expect(selected.length).toBeLessThan(80)
    expect(selected[0]!.occurrenceCount).toBeGreaterThanOrEqual(selected.at(-1)!.occurrenceCount)
  })

  it('backfills never-billed items when demand alone is sparse', () => {
    const ranked = rankSheetDemandCandidates([
      ...Array.from({ length: 8 }, (_, i) => candidate({
        catalogItemId: `billed-${i}`,
        name: `Billed ${i}`,
        occurrenceCount: 20 - i,
      })),
      ...Array.from({ length: 40 }, (_, i) => candidate({
        catalogItemId: `fill-${i}`,
        name: `Fill Light Bulb ${i}`,
        occurrenceCount: 0,
        categoryName: 'Lights',
      })),
    ])
    const selected = selectCandidatesForSheetCapacity(ranked)
    expect(selected.length).toBeGreaterThan(8)
    expect(selected.some(c => c.occurrenceCount === 0)).toBe(true)
  })
})

describe('groupCandidatesByClassicSections', () => {
  it('builds classic shop sections instead of vague Body/Service buckets', () => {
    const items = [
      candidate({ catalogItemId: '1', name: 'Wash Bus Body', occurrenceCount: 12 }),
      candidate({ catalogItemId: '2', name: 'Replace Marker Light Bulb', occurrenceCount: 40 }),
      candidate({ catalogItemId: '3', name: 'Replace Fuel Filter', occurrenceCount: 22 }),
      candidate({ catalogItemId: '4', name: 'Adjust All Brakes', occurrenceCount: 18 }),
      candidate({ catalogItemId: '5', name: 'Inspection Service', occurrenceCount: 30 }),
    ]
    const sections = groupCandidatesByClassicSections(items)
    const titles = sections.map(s => s.title)
    expect(titles).toContain('Cleaning')
    expect(titles).toContain('Lights')
    expect(titles).toContain('Filters')
    expect(titles).toContain('Brakes and Hub Seals')
    expect(titles).toContain('Inspection')
    expect(titles).not.toContain('Body')
    expect(titles).not.toContain('Service')
  })
})

describe('packSectionsIntoDocument', () => {
  it('packs into left/right with QR void room and classic columns', () => {
    const items = Array.from({ length: 36 }, (_, i) => {
      const names = [
        'Clean Inside Bus',
        'Replace Signal Light Bulb',
        'Replace Fuel Filter',
        'Adjust All Brakes',
        'Replace Front Tire',
        'Inspection Service',
      ]
      return candidate({
        catalogItemId: `id-${i}`,
        name: `${names[i % names.length]} ${i}`,
        occurrenceCount: 40 - i,
      })
    })
    const byId = new Map(items.map(i => [i.catalogItemId, i]))
    const sections = groupCandidatesByClassicSections(items)
    const document = packSectionsIntoDocument(sections, byId)
    const fit = sheetGenerationFitSummary(document)

    expect(document.version).toBe(2)
    expect(document.sections.length).toBeGreaterThan(0)
    expect(fit.rows).toBeLessThanOrEqual(SHEET_FRONT_PAGE_ROW_CAPACITY)
    expect(fit.qrFits).toBe(true)
    // Dense like the Letter PDF — not a half-empty ~22-row sheet.
    expect(fit.rows).toBeGreaterThanOrEqual(28)
    expect(document.sections.reduce((n, s) => n + s.items.length, 0)).toBeGreaterThanOrEqual(30)
  })

  it('ensureQrVoid trims right until void is large enough', () => {
    const items = Array.from({ length: 10 }, (_, i) => candidate({
      catalogItemId: `id-${i}`,
      name: `Item ${i}`,
      categoryName: 'A',
    }))
    const byId = new Map(items.map(i => [i.catalogItemId, i]))
    const document = packSectionsIntoDocument(
      [{ title: 'A', itemIds: items.map(i => i.catalogItemId) }],
      byId,
    )
    const ensured = ensureQrVoid(document, 3)
    const fit = sheetGenerationFitSummary(ensured)
    expect(fit.qrVoidRows).toBeGreaterThanOrEqual(3)
  })

  it('groupCandidatesByCategory delegates to classic grouping', () => {
    const items = [
      candidate({ catalogItemId: '1', name: 'Replace Air Filter', occurrenceCount: 5 }),
    ]
    expect(groupCandidatesByCategory(items)[0]!.title).toBe('Filters')
  })
})
