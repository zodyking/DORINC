import { describe, expect, it } from 'vitest'
import { assertPdfBlob } from '../../app/utils/fetch-blob-error'

describe('assertPdfBlob', () => {
  it('accepts valid PDF bytes', async () => {
    const blob = new Blob(['%PDF-1.7 test'], { type: 'application/pdf' })
    await expect(assertPdfBlob(blob)).resolves.toBeUndefined()
  })

  it('rejects HTML error pages', async () => {
    const blob = new Blob(['<!DOCTYPE html><title>502 Bad gateway</title>'], { type: 'text/html' })
    await expect(assertPdfBlob(blob)).rejects.toThrow(/error page/)
  })

  it('rejects non-PDF payloads', async () => {
    const blob = new Blob(['not a pdf'], { type: 'application/octet-stream' })
    await expect(assertPdfBlob(blob)).rejects.toThrow(/invalid document/)
  })
})
