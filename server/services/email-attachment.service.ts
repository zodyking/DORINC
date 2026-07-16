import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appFiles } from '../db/schema/files'
import { conversations, messages } from '../db/schema/messages'
import { FilesServiceError, getFileWithData } from './files.service'

export async function getEmailAttachment(
  db: Db,
  conversationId: string,
  messageId: string,
  fileId: string,
) {
  const [owned] = await db.select({ id: appFiles.id })
    .from(appFiles)
    .innerJoin(messages, eq(messages.id, appFiles.ownerEntityId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(
      eq(appFiles.id, fileId),
      eq(appFiles.ownerEntityType, 'message'),
      eq(appFiles.ownerEntityId, messageId),
      eq(messages.conversationId, conversationId),
      eq(conversations.type, 'email'),
      isNull(appFiles.archivedAt),
    ))
    .limit(1)

  if (!owned) throw new FilesServiceError('NOT_FOUND')
  return getFileWithData(db, fileId)
}

export function safeAttachmentDownloadName(filename: string): string {
  return filename.replace(/["\\\r\n]/g, '_').slice(0, 240) || 'attachment'
}
