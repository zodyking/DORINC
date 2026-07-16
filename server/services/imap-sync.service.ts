import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import type { Db } from '../db/client'
import { imapSyncState } from '../db/schema/email-inbox'
import { eq } from 'drizzle-orm'
import { getImapConfig } from './imap-config.service'
import {
  buildAllowedFilterAddresses,
  ingestInboundEmail,
  isEmailInboxReady,
  messageMatchesFilter,
} from './email-inbox.service'
import { extractEmailAddresses } from '../mail/email-thread'

export interface ImapSyncResult {
  fetched: number
  ingested: number
  skipped: number
  errors: number
}

export async function testImapConnection(): Promise<{ ok: true, mailbox: string, messageCount: number }> {
  const config = getImapConfig()
  if (!config) throw new Error('IMAP is not configured')

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.useTls,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  })

  await client.connect()
  try {
    const lock = await client.getMailboxLock(config.mailbox)
    try {
      const status = await client.status(config.mailbox, { messages: true })
      return { ok: true, mailbox: config.mailbox, messageCount: status.messages ?? 0 }
    }
    finally {
      lock.release()
    }
  }
  finally {
    await client.logout()
  }
}

export async function syncImapInbox(db: Db, opts: { full?: boolean } = {}): Promise<ImapSyncResult> {
  const config = getImapConfig()
  if (!config) throw new Error('IMAP is not configured')
  if (!(await isEmailInboxReady(db))) {
    throw new Error('Email inbox tables are not ready yet. Restart the app after deploy to apply database migration 0047.')
  }

  const [state] = await db.select().from(imapSyncState).where(eq(imapSyncState.id, 'default')).limit(1)
  const lastUid = opts.full ? 0 : Number(state?.lastUid ?? 0)

  const allowed = await buildAllowedFilterAddresses(db)
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.useTls,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  })

  const result: ImapSyncResult = { fetched: 0, ingested: 0, skipped: 0, errors: 0 }
  let maxUid = lastUid

  await client.connect()
  try {
    const lock = await client.getMailboxLock(config.mailbox)
    try {
      const range = lastUid > 0 ? `${lastUid + 1}:*` : '1:*'
      for await (const msg of client.fetch(range, {
        uid: true,
        source: true,
        envelope: true,
        internalDate: true,
      })) {
        result.fetched++
        if (msg.uid) maxUid = Math.max(maxUid, msg.uid)

        try {
          const parsed = await simpleParser(msg.source)
          const from = parsed.from?.value?.[0]?.address ?? msg.envelope?.from?.[0]?.address ?? ''
          const to = extractEmailAddresses(parsed.to?.value?.map(v => v.address ?? '') ?? msg.envelope?.to?.map(v => v.address ?? '') ?? [])
          const cc = extractEmailAddresses(parsed.cc?.value?.map(v => v.address ?? '') ?? msg.envelope?.cc?.map(v => v.address ?? '') ?? [])

          if (!messageMatchesFilter(allowed, from, to, cc)) {
            result.skipped++
            continue
          }

          const internetMessageId = (parsed.messageId ?? msg.envelope?.messageId ?? '').trim()
          if (!internetMessageId) {
            result.skipped++
            continue
          }

          const ingest = await ingestInboundEmail(db, {
            from,
            to,
            cc,
            subject: parsed.subject ?? msg.envelope?.subject ?? '',
            text: parsed.text ?? parsed.textAsHtml ?? '',
            html: typeof parsed.html === 'string' ? parsed.html : null,
            internetMessageId,
            inReplyTo: parsed.inReplyTo ?? null,
            references: Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references ?? null),
            receivedAt: msg.internalDate ?? parsed.date ?? new Date(),
          })

          if (ingest.skipped) result.skipped++
          else result.ingested++
        }
        catch (err) {
          result.errors++
          console.error('[imap-sync] message parse failed', err)
        }
      }
    }
    finally {
      lock.release()
    }
  }
  finally {
    await client.logout()
  }

  const now = new Date()
  if (state) {
    await db.update(imapSyncState).set({
      mailbox: config.mailbox,
      lastUid: maxUid,
      lastSyncAt: now,
      lastError: result.errors ? `${result.errors} message(s) failed` : null,
    }).where(eq(imapSyncState.id, 'default'))
  }
  else {
    await db.insert(imapSyncState).values({
      id: 'default',
      mailbox: config.mailbox,
      lastUid: maxUid,
      lastSyncAt: now,
      lastError: result.errors ? `${result.errors} message(s) failed` : null,
    })
  }

  return result
}
