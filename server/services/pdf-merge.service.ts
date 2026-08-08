import { PDFDocument } from 'pdf-lib'

/** Merge PDF buffers newest-first (caller should already sort). */
export async function mergePdfBuffers(pdfs: Buffer[]): Promise<Buffer> {
  if (!pdfs.length) throw new Error('No PDFs to merge')
  if (pdfs.length === 1) return pdfs[0]!

  const merged = await PDFDocument.create()
  for (const pdf of pdfs) {
    const src = await PDFDocument.load(pdf, { ignoreEncryption: true })
    const pages = await merged.copyPages(src, src.getPageIndices())
    for (const page of pages) merged.addPage(page)
  }
  const bytes = await merged.save()
  return Buffer.from(bytes)
}
