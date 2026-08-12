import { describe, expect, it } from 'vitest'
import {
  ensureQrVoid,
  groupCandidatesByCategory,
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

describe('selectCandidatesForSheetCapacity', () => {
  it('keeps a capacity-safe subset of ranked items', () => {
    const ranked = rankSheetDemandCandidates(
      Array.from({ length: 80 }, (_, i) => candidate({
        catalogItemId: `id-${i}`,
        name: `Service ${i}`,
        occurrenceCount: 80 - i,
        categoryName: i % 2 ? 'Lights' : 'Brakes',
      })),
    )
    const selected = selectCandidatesForSheetCapacity(ranked)
    expect(selected.length).toBeGreaterThan(10)
    expect(selected.length).toBeLessThan(80)
    expect(selected[0]!.occurrenceCount).toBeGreaterThanOrEqual(selected.at(-1)!.occurrenceCount)
  })
})

describe('packSectionsIntoDocument', () => {
  it('packs into left/right with QR void room', () => {
    const items = Array.from({ length: 24 }, (_, i) => candidate({
      catalogItemId: `id-${i}`,
      name: `Item ${i}`,
      occurrenceCount: 30 - i,
      categoryName: i < 12 ? 'Lights' : 'Brakes',
    }))
    const byId = new Map(items.map(i => [i.catalogItemId, i]))
    const sections = groupCandidatesByCategory(items)
    const document = packSectionsIntoDocument(sections, byId)
    const fit = sheetGenerationFitSummary(document)

    expect(document.version).toBe(2)
    expect(document.sections.length).toBeGreaterThan(0)
    expect(fit.rows).toBeLessThanOrEqual(SHEET_FRONT_PAGE_ROW_CAPACITY)
    expect(fit.qrFits).toBe(true)
  })

  it('ensureQrVoid trims right until void is large enough', () => {
    const items = Array.from({ length: 10 }, (_, i) => candidate({
      catalogItemId: `id-${i}`,
      name: `Item ${i}`,
      categoryName: 'A',
    }))
    const byId = new Map(items.map(i => [i.catalogItemId, i]))
    // Force a heavy right by packing then moving all to right-ish — use ensureQrVoid directly.
    const document = packSectionsIntoDocument(
      [{ title: 'A', itemIds: items.map(i => i.catalogItemId) }],
      byId,
    )
    const ensured = ensureQrVoid(document, 3)
    const fit = sheetGenerationFitSummary(ensured)
    expect(fit.qrVoidRows).toBeGreaterThanOrEqual(3)
  })
})
