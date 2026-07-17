import { describe, expect, it } from 'vitest'
import { fetchErrorMessage } from '../../app/utils/fetch-blob-error'

describe('fetchErrorMessage', () => {
  it('reads nested API error bodies', async () => {
    const err = {
      data: { data: { message: 'No published invoice template is configured' } },
    }
    await expect(fetchErrorMessage(err, 'fallback')).resolves.toBe('No published invoice template is configured')
  })

  it('parses JSON error bodies from blob responses', async () => {
    const response = new Response(
      JSON.stringify({ code: 'UPSTREAM_ERROR', message: 'PDF render service is unavailable', details: {}, requestId: 'r1' }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
    const err = { response, message: '[GET] "/api/invoices/x/preview-pdf": 502' }
    await expect(fetchErrorMessage(err, 'fallback')).resolves.toBe('PDF render service is unavailable')
  })

  it('parses JSON embedded in FetchError data Blob', async () => {
    const blob = new Blob(
      [JSON.stringify({ message: 'No published invoice template is configured' })],
      { type: 'application/json' },
    )
    const err = { data: blob, statusCode: 500, message: '[GET] "/api/invoices/x/preview-pdf": 500' }
    await expect(fetchErrorMessage(err, 'fallback')).resolves.toBe('No published invoice template is configured')
  })

  it('maps generic 500 fetch errors to a helpful message', async () => {
    const err = { statusCode: 500, message: '[GET] "/api/invoices/x/preview-pdf": 500' }
    await expect(fetchErrorMessage(err, 'fallback')).resolves.toContain('PDF generation failed')
  })

  it('sanitizes HTML 502 gateway pages instead of showing raw markup', async () => {
    const html = '<!DOCTYPE html><html><head><title>502 Bad gateway</title></head><body>error</body></html>'
    const blob = new Blob([html], { type: 'text/html' })
    const err = { data: blob, statusCode: 502, message: '[GET] "/api/invoices/x/preview-pdf": 502' }
    await expect(fetchErrorMessage(err, 'fallback')).resolves.toContain('PDF render service is unavailable')
    await expect(fetchErrorMessage(err, 'fallback')).resolves.not.toContain('<!DOCTYPE html>')
  })
})
