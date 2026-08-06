/** Convert a data-URL image into a File for upload. */
export function dataUrlToFile(dataUrl: string, filename = 'pasted-image.png'): File | null {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i.exec(dataUrl.trim())
  if (!match) return null
  const mime = (match[1] || 'image/png').toLowerCase()
  if (!mime.startsWith('image/')) return null
  const b64 = match[2]
  try {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    const ext = mime.split('/')[1]?.split('+')[0] || 'png'
    const safeName = filename.includes('.') ? filename : `pasted-image.${ext}`
    return new File([bytes], safeName, { type: mime })
  }
  catch {
    return null
  }
}

export function announcementBodyHasInlineDataImages(html: string): boolean {
  return /src\s*=\s*["']\s*data:/i.test(html || '')
}

/** Collect unique data: image src values from HTML. */
export function extractDataImageSrcs(html: string): string[] {
  const found = new Set<string>()
  const re = /src\s*=\s*["']\s*(data:image\/[^"']+)\s*["']/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html || '')) != null) {
    if (match[1]) found.add(match[1])
  }
  return [...found]
}

export async function uploadAnnouncementImage(announcementId: string, file: File): Promise<{ id: string, url: string }> {
  const body = new FormData()
  body.append('file', file)
  body.append('ownerEntityType', 'announcement')
  body.append('ownerEntityId', announcementId)
  body.append('fileKind', 'attachment')
  const res = await $fetch<{ file: { id: string } }>('/api/files', {
    method: 'POST',
    body,
  })
  return {
    id: res.file.id,
    url: `/api/files/${res.file.id}/preview`,
  }
}

/**
 * Upload any pasted data-URL images and rewrite their src to file preview URLs.
 * Returns the original HTML when no data images are present.
 */
export async function materializeAnnouncementDataImages(
  html: string,
  announcementId: string,
): Promise<string> {
  const srcs = extractDataImageSrcs(html)
  if (!srcs.length) return html

  let out = html
  for (let i = 0; i < srcs.length; i += 1) {
    const src = srcs[i]!
    const file = dataUrlToFile(src, `inline-image-${i + 1}.png`)
    if (!file) continue
    const uploaded = await uploadAnnouncementImage(announcementId, file)
    out = out.split(src).join(uploaded.url)
  }
  return out
}
