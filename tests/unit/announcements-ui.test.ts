import { describe, expect, it } from 'vitest'
import { announcementUpsertSchema } from '../../shared/validators/announcements'
import {
  announcementBodyHasInlineDataImages,
  announcementSaveErrorMessage,
  localDateTimeToIso,
} from '../../app/utils/announcements-ui'
import {
  dataUrlToFile,
  extractDataImageSrcs,
} from '../../app/utils/announcement-inline-images'

const tinyPng
  = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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
            { path: 'bodyHtml', message: 'Message body is too large. Prefer the Image button or paste so images upload as files.' },
          ],
        },
      },
    }, 'fallback')
    expect(msg).toContain('Message body is too large')
    expect(msg).not.toBe('Request validation failed')
  })

  it('parses data-url images into File objects', () => {
    const file = dataUrlToFile(tinyPng, 'shot.png')
    expect(file).not.toBeNull()
    expect(file?.type).toBe('image/png')
    expect(file?.name).toBe('shot.png')
    expect(file && file.size > 0).toBe(true)
  })

  it('extracts unique data image sources from html', () => {
    const html = `<p>x</p><img src="${tinyPng}"><img src='${tinyPng}'>`
    expect(extractDataImageSrcs(html)).toEqual([tinyPng])
  })
})

describe('announcementUpsertSchema', () => {
  it('accepts body html that still contains a data-url image (client materializes on save)', () => {
    const result = announcementUpsertSchema.safeParse({
      title: 'Hello',
      bodyHtml: `<img src="${tinyPng}">`,
      audience: { targetType: 'all' },
    })
    expect(result.success).toBe(true)
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
