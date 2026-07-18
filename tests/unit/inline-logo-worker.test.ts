import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  EMAIL_INLINE_LOGO_CID,
  embedInlineLogoInHtml,
} from '../../server/mail/inline-logo.mjs'

describe('inline-logo worker embedding', () => {
  it('rewrites branded logo URLs to CID and attaches inline logo bytes', async () => {
    const html = `<img src="https://app.example.com/images/dorinc-icon-trans.png" width="38" height="38" alt="Shop">`
    const result = await embedInlineLogoInHtml(html, {})
    expect(result.html).toContain(`src="cid:${EMAIL_INLINE_LOGO_CID}"`)
    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]?.contentDisposition).toBe('inline')
    expect(result.attachments[0]?.cid).toBe(EMAIL_INLINE_LOGO_CID)
    expect(result.attachments[0]?.content.byteLength).toBeGreaterThan(0)
  })

  it('loads custom workspace logo bytes from the database pool', async () => {
    const logoBytes = readFileSync(join(process.cwd(), 'public/images/dorinc-icon-trans.png'))
    const fileId = 'logo-file-123'
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        expect(params[0]).toBe(fileId)
        expect(sql).toContain('app_files')
        return {
          rows: [{
            binary_data: logoBytes,
            mime_type: 'image/png',
            file_kind: 'preview',
          }],
        }
      },
    }

    const html = `<img src="https://app.example.com/api/files/${fileId}/preview" width="38" height="38" alt="Shop">`
    const result = await embedInlineLogoInHtml(html, { pool: pool as never })
    expect(result.html).toContain(`src="cid:${EMAIL_INLINE_LOGO_CID}"`)
    expect(result.attachments[0]?.contentType).toBe('image/png')
    expect(result.attachments[0]?.content.equals(logoBytes)).toBe(true)
  })
})
