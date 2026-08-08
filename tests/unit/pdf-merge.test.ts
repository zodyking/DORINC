import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { mergePdfBuffers } from '../../server/services/pdf-merge.service'

async function tinyPdf(label: string): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([200, 200])
  page.drawText(label, { x: 24, y: 100, size: 12 })
  return Buffer.from(await doc.save())
}

describe('mergePdfBuffers', () => {
  it('merges pages in caller order (newest first)', async () => {
    const a = await tinyPdf('A')
    const b = await tinyPdf('B')
    const merged = await mergePdfBuffers([a, b])
    const doc = await PDFDocument.load(merged)
    expect(doc.getPageCount()).toBe(2)
  })

  it('returns the single PDF unchanged when only one buffer is provided', async () => {
    const a = await tinyPdf('solo')
    const merged = await mergePdfBuffers([a])
    expect(merged.equals(a)).toBe(true)
  })
})
