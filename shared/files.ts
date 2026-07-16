import type { FileKind } from '../server/db/schema/files'

/** User uploads and attachments — excludes thumbnails/previews generated from uploads. */
export const USER_UPLOAD_FILE_KINDS = ['original', 'attachment'] as const satisfies readonly FileKind[]

export function isUserUploadFileKind(fileKind: string): boolean {
  return (USER_UPLOAD_FILE_KINDS as readonly string[]).includes(fileKind)
}

export function filePreviewUrl(fileId: string): string {
  return `/api/files/${fileId}/preview`
}
