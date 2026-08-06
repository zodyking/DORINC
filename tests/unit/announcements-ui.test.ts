import { describe, expect, it } from 'vitest'
import { announcementUpsertSchema } from '../../shared/validators/announcements'
import {
  announcementBodyHasInlineDataImages,
  announcementSaveErrorMessage,
  localDateTimeToIso,
} from '../../app/utils/announcements-ui'

describe('announcement editor helpers', () => {
  it('detects pasted data-url images in body html', () => {
    expect(announcementBodyHasInlineDataImages('<p>ok</p>')).toBe(false)
    expect(announcementBodyHasInlineDataImages('<img src="data:image/png;base64,abc">')).toBe(true)
  })

  it('converts local datetime inputs to ISO', () => {
    const iso = localDateTimeToIso('2026-08-06T10:34')
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(localDateTimeToIso('')).toBeNull()
    expect(localDateTimeToIso('not-a-date')).toBeNull()
  })

  it('surfaces zod issue messages from API errors', () => {
    const msg = announcementSaveErrorMessage({
      data: {
        message: 'Request validation failed',
        details: {
          issues: [
            { path: 'bodyHtml', message: 'Pasted inline images cannot be saved. Save the message first, then use the Image button to upload.' },
          ],
        },
      },
    }, 'fallback')
    expect(msg).toContain('Pasted inline images cannot be saved')
    expect(msg).not.toBe('Request validation failed')
  })
})

describe('announcementUpsertSchema', () => {
  it('rejects pasted data-url images with a clear message', () => {
    const result = announcementUpsertSchema.safeParse({
      title: 'Hello',
      bodyHtml: '<img src="data:image/png;base64,AAAA">',
      audience: { targetType: 'all' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/Image button/i)
    }
  })

  it('accepts a normal create payload', () => {
    const result = announcementUpsertSchema.safeParse({
      title: 'Recording Payment On Invoices',
      subtitle: 'Invoice Reconciliation',
      bodyHtml: '<p>Please review overdue invoices.</p>',
      isActive: true,
      priority: 10,
      startsAt: new Date('2026-08-06T10:34').toISOString(),
      endsAt: new Date('2026-08-27T10:34').toISOString(),
      audience: { targetType: 'all' },
      ctaButtons: [],
    })
    expect(result.success).toBe(true)
  })
})
