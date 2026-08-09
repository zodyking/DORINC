import { ImapFlow } from 'imapflow'
import type { Db } from '../db/client'
import { getImapConfig, refreshImapConfigCache } from './imap-config.service'
import { deleteImapByInternetMessageIds } from '../workers/lib/staples-printme-imap-delete.mjs'

/**
 * Best-effort: remove a Staples PrintMe confirmation from the IMAP inbox by Message-ID.
 * Never throws — dismiss/remove must succeed even if IMAP is down.
 */
export async function deleteStaplesPrintMeReplyFromInbox(
  db: Db,
  internetMessageId: string | null | undefined,
): Promise<{ deleted: number }> {
  const messageId = internetMessageId?.trim()
  if (!messageId) return { deleted: 0 }

  try {
    await refreshImapConfigCache(db)
  }
  catch {
    // fall through to cached/env config
  }

  const config = getImapConfig()
  if (!config?.host || !config.user) return { deleted: 0 }

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.useTls,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(config.mailbox)
    try {
      const deleted = await deleteImapByInternetMessageIds(client, [messageId])
      if (deleted) {
        console.info('[staples-printme] deleted PrintMe confirmation from inbox', {
          messageId,
          deleted,
        })
      }
      return { deleted }
    }
    finally {
      lock.release()
    }
  }
  catch (err) {
    console.error('[staples-printme] IMAP delete on remove failed', err)
    return { deleted: 0 }
  }
  finally {
    await client.logout().catch(() => {})
  }
}
