import { describe, expect, it } from 'vitest'
import {
  injectPdfPageMargins,
  isPdfUpstreamFailureMessage,
  normalizePdfPaper,
  pdfUpstreamUnavailableMessage,
} from '../../shared/pdf-render'

const SAMPLE_HTML = `<!doctype html>
<html><head><style>@page { size: Letter; margin: 0.5in; }</style></head>
<body><h1>Invoice</h1></body></html>`

describe('pdf-render helpers', () => {
  it('normalizes paper sizes', () => {
    expect(normalizePdfPaper('A4')).toBe('a4')
    expect(normalizePdfPaper('letter')).toBe('letter')
    expect(normalizePdfPaper('Letter')).toBe('letter')
  })

  it('replaces @page margins in template HTML', () => {
    const out = injectPdfPageMargins(SAMPLE_HTML, { paper: 'A4', marginInches: 0.75 })
    expect(out).toContain('size: A4; margin: 0.75in 0.75in 0.75in 0.75in')
    expect(out).not.toContain('size: Letter')
  })

  it('injects @page when missing', () => {
    const out = injectPdfPageMargins('<html><head></head><body>x</body></html>', { paper: 'letter', marginInches: 0.5 })
    expect(out).toContain('@page { size: Letter; margin: 0.5in 0.5in 0.5in 0.5in; }')
  })

  it('detects upstream PDF failures', () => {
    expect(isPdfUpstreamFailureMessage('Laravel PDF service failed (500): boom')).toBe(true)
    expect(isPdfUpstreamFailureMessage('fetch failed')).toBe(true)
    expect(isPdfUpstreamFailureMessage('Invalid template HTML')).toBe(false)
  })

  it('builds operator-friendly upstream message', () => {
    const msg = pdfUpstreamUnavailableMessage('fetch failed')
    expect(msg).toContain('laravel-pdf')
    expect(msg).toContain('fetch failed')
  })
})
