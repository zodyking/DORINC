import type { H3Event } from 'h3'
import { getHeader, readMultipartFormData } from 'h3'
import { maxUploadBytes } from '../services/files.service'
import type { OutboundAttachmentInput } from '../services/email-inbox.service'

/** Max attachments accepted on a single outgoing email. */
export const MAX_EMAIL_ATTACHMENTS = 10

export function isMultipartRequest(event: H3Event): boolean {
  const contentType = getHeader(event, 'content-type') ?? ''
  return contentType.toLowerCase().includes('multipart/form-data')
}

export interface ParsedEmailComposeForm {
  fields: Record<string, string>
  attachments: OutboundAttachmentInput[]
}

/**
 * Parse a multipart email-compose request into plain text fields and attachment
 * buffers. Any part carrying a filename is treated as an attachment; everything
 * else becomes a string field.
 */
export async function readEmailComposeForm(event: H3Event): Promise<ParsedEmailComposeForm | null> {
  const parts = await readMultipartFormData(event, {
    maxSize: maxUploadBytes() * (MAX_EMAIL_ATTACHMENTS + 1),
  }).catch(() => null)
  if (!parts?.length) return null

  const fields: Record<string, string> = {}
  const attachments: OutboundAttachmentInput[] = []

  for (const part of parts) {
    if (part.filename) {
      if (attachments.length >= MAX_EMAIL_ATTACHMENTS) continue
      attachments.push({
        filename: part.filename,
        mimeType: (part.type ?? 'application/octet-stream').toLowerCase(),
        data: part.data,
      })
    }
    else if (part.name) {
      fields[part.name] = part.data.toString('utf8')
    }
  }

  return { fields, attachments }
}
