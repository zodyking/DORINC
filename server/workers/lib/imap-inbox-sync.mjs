// In-process IMAP inbox sync for the worker container (no TS subprocess).
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import { ensureEmailInboxSchema } from '../../lib/ensure-email-inbox-schema.mjs'
import { loadImapConfig, loadSmtpConfig } from './app-config.mjs'
import { loadImapFilters } from './imap-filters.mjs'
import {
  buildReplyThreadHeaders,
  extractEmailAddresses,
  generateInternetMessageId,
  messageIdDomain,
  normalizeEmailAddress,
} from './email-thread.mjs'
import { buildCustomerAutoResponderEmail } from '../../mail/templates/system.mjs'
import { embedInlineLogoInHtml } from '../../mail/inline-logo.mjs'
import { persistInboundAttachments, repairInboundEmailMedia } from './imap-attachments.mjs'
import { suppressesInboundEmail } from './email-ingest-suppression.mjs'

const DEFAULT_SYNC_INTERVAL_MS = 15_000

let syncInProgress = false
let cachedTransport
let cachedTransportKey

function headerValue(parsed, name) {
  const raw = parsed.headers?.get(name)
  return raw == null ? null : String(raw)
}

function buildCompanyInboxAddresses(filters, smtp) {
  const inboxes = new Set()
  if (filters.companyEmail) inboxes.add(filters.companyEmail.toLowerCase())
  for (const addr of filters.additionalEmails) inboxes.add(addr.toLowerCase())
  if (smtp?.from) {
    for (const addr of extractEmailAddresses(smtp.from)) inboxes.add(addr)
  }
  if (smtp?.user) inboxes.add(smtp.user.toLowerCase())
  return inboxes
}

async function buildCustomerEmailAddresses(pool, includeCustomerEmails) {
  const emails = new Set()
  if (!includeCustomerEmails) return emails

  const { rows: customers } = await pool.query(
    `SELECT email FROM customers WHERE archived_at IS NULL AND email IS NOT NULL`,
  )
  for (const row of customers) {
    if (row.email) emails.add(String(row.email).toLowerCase())
  }

  const { rows: contacts } = await pool.query(
    `SELECT email FROM customer_contacts WHERE archived_at IS NULL AND email IS NOT NULL`,
  )
  for (const row of contacts) {
    if (row.email) emails.add(String(row.email).toLowerCase())
  }

  return emails
}

function messageMatchesCompanyInboxFilter(companyInboxes, from, to, cc = []) {
  if (!companyInboxes.size) return false
  const fromAddr = normalizeEmailAddress(from)
  if (!fromAddr || companyInboxes.has(fromAddr)) return false
  const recipients = [...to, ...cc].map(normalizeEmailAddress)
  return recipients.some(addr => companyInboxes.has(addr))
}

function messageMatchesCustomerInboxFilter(companyInboxes, customerEmails, from, to, cc = []) {
  if (!companyInboxes.size || !customerEmails.size) return false
  const fromAddr = normalizeEmailAddress(from)
  if (!customerEmails.has(fromAddr)) return false
  return messageMatchesCompanyInboxFilter(companyInboxes, from, to, cc)
}

function shouldIngestInboundEmail(companyInboxes, customerEmails, from, to, cc, filters) {
  if (!messageMatchesCompanyInboxFilter(companyInboxes, from, to, cc)) return false
  if (messageMatchesCustomerInboxFilter(companyInboxes, customerEmails, from, to, cc)) return true
  return filters.autoResponder.enabled && filters.autoResponder.scope === 'all'
}

function shouldAutoRespondToInbound(customer, filters) {
  if (!filters.autoResponder.enabled) return false
  if (filters.autoResponder.scope === 'all') return true
  return !!customer
}

function shouldSkipAutoResponder(input) {
  if (input.autoSubmitted && !/^no$/i.test(String(input.autoSubmitted).trim())) return true
  if (input.precedence && /bulk|junk|list/i.test(String(input.precedence))) return true
  const subject = String(input.subject ?? '').toLowerCase()
  return subject.includes('automatic reply')
    || subject.includes('auto-reply')
    || subject.includes('out of office')
}

async function resolveCustomerByEmail(pool, email) {
  const normalized = normalizeEmailAddress(email)
  const { rows: customers } = await pool.query(
    `SELECT id, display_name, email
     FROM customers
     WHERE archived_at IS NULL AND lower(email) = $1
     LIMIT 1`,
    [normalized],
  )
  if (customers[0]) {
    return {
      id: customers[0].id,
      displayName: customers[0].display_name,
      email: customers[0].email,
    }
  }

  const { rows: contacts } = await pool.query(
    `SELECT cc.customer_id, c.display_name, cc.email
     FROM customer_contacts cc
     INNER JOIN customers c ON c.id = cc.customer_id
     WHERE cc.archived_at IS NULL AND lower(cc.email) = $1
     LIMIT 1`,
    [normalized],
  )
  if (contacts[0]) {
    return {
      id: contacts[0].customer_id,
      displayName: contacts[0].display_name,
      email: contacts[0].email,
    }
  }
  return null
}

async function loadEmailBrand(pool) {
  const appUrl = process.env.APP_URL?.trim()?.replace(/\/$/, '') || 'http://localhost:3000'
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'workspace.business_profile' LIMIT 1`,
  )
  const profile = rows[0]?.value || {}
  const brandName = String(profile.businessName ?? profile.tradeName ?? profile.legalName ?? 'Devon On Site Repairs').trim()
    || 'Devon On Site Repairs'
  return {
    brandName,
    brandLegal: brandName,
    brandTagline: String(profile.tagline ?? '').trim(),
    logoUrl: `${appUrl}/images/dorinc-icon-trans.png`,
    logoInitial: (brandName.charAt(0) || 'D').toUpperCase(),
    appUrl,
  }
}

async function getSmtpTransport(pool) {
  const config = await loadSmtpConfig(pool)
  if (!config?.host || !config.from) throw new Error('SMTP is not configured')
  const key = `${config.host}:${config.port}:${config.user}:${config.from}`
  if (!cachedTransport || cachedTransportKey !== key) {
    cachedTransport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    })
    cachedTransportKey = key
  }
  return { transport: cachedTransport, from: config.from, config }
}

async function sendAutoResponder(pool, input) {
  const filters = await loadImapFilters(pool)
  const auto = filters.autoResponder
  if (!auto.enabled || !auto.message.trim()) return { sent: false }

  const to = normalizeEmailAddress(input.toEmail)
  if (!to) return { sent: false }

  const brand = await loadEmailBrand(pool)
  const autoSubject = auto.subject.trim() || 'We received your message'
  const { subject: replySubject, inReplyTo, references } = buildReplyThreadHeaders({
    subject: input.inboundSubject,
    fallbackSubject: autoSubject,
    parentMessageId: input.inboundMessageId,
    existingReferences: input.inboundReferences,
  })
  const mail = buildCustomerAutoResponderEmail({
    recipientName: input.recipientName,
    subject: replySubject,
    message: auto.message.trim(),
    appUrl: brand.appUrl,
    brand,
  })

  const { transport, from, config } = await getSmtpTransport(pool)
  const internetMessageId = generateInternetMessageId(messageIdDomain(from))
  const prepared = await embedInlineLogoInHtml(mail.html)

  try {
    await transport.sendMail({
      from,
      to,
      subject: mail.subject,
      text: mail.text,
      html: prepared.html,
      messageId: internetMessageId,
      inReplyTo: inReplyTo ?? undefined,
      references: references ?? undefined,
      attachments: prepared.attachments,
    })
  }
  catch (err) {
    if (process.env.NODE_ENV === 'production') throw err
    console.warn('[imap-sync] auto-responder delivery failed (dev):', err instanceof Error ? err.message : err)
  }

  const { rows: messageRows } = await pool.query(
    `INSERT INTO messages (conversation_id, sender_user_id, body)
     VALUES ($1, NULL, $2)
     RETURNING id`,
    [input.conversationId, mail.text],
  )
  const messageId = messageRows[0].id

  await pool.query(
    `INSERT INTO email_message_meta (
       message_id, direction, internet_message_id, in_reply_to, email_references,
       from_address, to_addresses, cc_addresses, html_body, sent_by_user_id
     ) VALUES ($1, 'outbound', $2, $3, $4, $5, $6::jsonb, '[]'::jsonb, $7, NULL)`,
    [
      messageId,
      internetMessageId,
      inReplyTo,
      references,
      normalizeEmailAddress(config.from),
      JSON.stringify([to]),
      mail.html,
    ],
  )

  await pool.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [input.conversationId])
  await pool.query(`UPDATE email_threads SET updated_at = now() WHERE conversation_id = $1`, [input.conversationId])

  console.info('[imap-sync] auto-responder sent to', to)
  return { sent: true }
}

function normalizeInboundBody(text, html) {
  const plain = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (plain) return plain
  if (html) {
    return String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || '(empty message)'
  }
  return '(empty message)'
}

async function ingestInboundEmail(pool, input, filters) {
  const normalizedId = String(input.internetMessageId ?? '').trim()
  if (!normalizedId) return { skipped: true, reason: 'missing_message_id' }

  if (await suppressesInboundEmail(pool, {
    internetMessageId: normalizedId,
    inReplyTo: input.inReplyTo,
    references: input.references,
  })) {
    return { skipped: true, reason: 'suppressed' }
  }

  const { rows: existing } = await pool.query(
    `SELECT message_id FROM email_message_meta WHERE internet_message_id = $1 LIMIT 1`,
    [normalizedId],
  )
  if (existing[0]) {
    const repaired = await repairInboundEmailMedia(pool, existing[0].message_id, input)
    return { skipped: true, reason: 'duplicate', repaired }
  }

  const from = normalizeEmailAddress(input.from)
  const smtp = await loadSmtpConfig(pool)
  const companyInboxes = buildCompanyInboxAddresses(filters, smtp)
  const customerEmails = await buildCustomerEmailAddresses(pool, filters.includeCustomerEmails)
  if (!shouldIngestInboundEmail(companyInboxes, customerEmails, from, input.to, input.cc ?? [], filters)) {
    return { skipped: true, reason: 'filtered' }
  }

  let conversationId = null
  let isNewThread = false

  if (input.inReplyTo) {
    const { rows } = await pool.query(
      `SELECT m.conversation_id
       FROM email_message_meta em
       INNER JOIN messages m ON m.id = em.message_id
       WHERE em.internet_message_id = $1
       LIMIT 1`,
      [input.inReplyTo],
    )
    conversationId = rows[0]?.conversation_id ?? null
  }

  if (!conversationId && input.references) {
    for (const ref of String(input.references).split(/\s+/).filter(Boolean)) {
      const { rows } = await pool.query(
        `SELECT m.conversation_id
         FROM email_message_meta em
         INNER JOIN messages m ON m.id = em.message_id
         WHERE em.internet_message_id = $1
         LIMIT 1`,
        [ref],
      )
      if (rows[0]?.conversation_id) {
        conversationId = rows[0].conversation_id
        break
      }
    }
  }

  const customer = await resolveCustomerByEmail(pool, from)

  if (!conversationId) {
    isNewThread = true
    const { rows: convRows } = await pool.query(
      `INSERT INTO conversations (type) VALUES ('email') RETURNING id`,
    )
    conversationId = convRows[0].id
    await pool.query(
      `INSERT INTO email_threads (
         conversation_id, customer_id, counterpart_email, counterpart_name, subject, root_message_id
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        conversationId,
        customer?.id ?? null,
        from,
        customer?.displayName ?? null,
        String(input.subject ?? '').trim() || '(No subject)',
        normalizedId,
      ],
    )
  }

  const body = normalizeInboundBody(input.text, input.html)
  const { rows: messageRows } = await pool.query(
    `INSERT INTO messages (conversation_id, sender_user_id, body, created_at)
     VALUES ($1, NULL, $2, $3)
     RETURNING id`,
    [conversationId, body, input.receivedAt ?? new Date()],
  )
  const messageId = messageRows[0].id

  const attachmentCount = await persistInboundAttachments(pool, messageId, input.attachments)

  await pool.query(
    `INSERT INTO email_message_meta (
       message_id, direction, internet_message_id, in_reply_to, email_references,
       from_address, to_addresses, cc_addresses, html_body
     ) VALUES ($1, 'inbound', $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      messageId,
      normalizedId,
      input.inReplyTo ?? null,
      input.references ?? null,
      from,
      JSON.stringify(input.to),
      JSON.stringify(input.cc ?? []),
      input.html ?? null,
    ],
  )

  await pool.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId])
  await pool.query(`UPDATE email_threads SET updated_at = now() WHERE conversation_id = $1`, [conversationId])

  if (
    isNewThread
    && shouldAutoRespondToInbound(customer, filters)
    && !shouldSkipAutoResponder({
      subject: input.subject,
      autoSubmitted: input.autoSubmitted,
      precedence: input.precedence,
    })
  ) {
    try {
      await sendAutoResponder(pool, {
        conversationId,
        toEmail: from,
        recipientName: customer?.displayName ?? null,
        inboundMessageId: normalizedId,
        inboundSubject: input.subject,
        inboundReferences: input.references,
      })
    }
    catch (err) {
      console.warn('[imap-sync] auto-responder failed', err)
    }
  }

  return { skipped: false, conversationId, isNewThread, attachmentCount }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ full?: boolean }} [opts]
 */
export async function runImapInboxSync(pool, opts = {}) {
  if (syncInProgress) {
    return { fetched: 0, ingested: 0, skipped: 0, errors: 0, attachments: 0, repaired: 0, busy: true }
  }

  const config = await loadImapConfig(pool)
  if (!config?.host || !config?.user) {
    throw new Error('IMAP is not configured')
  }

  syncInProgress = true
  try {
    await ensureEmailInboxSchema(pool)
    const filters = await loadImapFilters(pool)

    const { rows: stateRows } = await pool.query(
      `SELECT last_uid FROM imap_sync_state WHERE id = 'default' LIMIT 1`,
    )
    const lastUid = opts.full ? 0 : Number(stateRows[0]?.last_uid ?? 0)

    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.useTls,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    })

    const result = { fetched: 0, ingested: 0, skipped: 0, errors: 0, attachments: 0, repaired: 0, busy: false }
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
            const to = extractEmailAddresses(
              parsed.to?.value?.map(v => v.address ?? '') ?? msg.envelope?.to?.map(v => v.address ?? '') ?? [],
            )
            const cc = extractEmailAddresses(
              parsed.cc?.value?.map(v => v.address ?? '') ?? msg.envelope?.cc?.map(v => v.address ?? '') ?? [],
            )

            const smtp = await loadSmtpConfig(pool)
            const companyInboxes = buildCompanyInboxAddresses(filters, smtp)
            const customerEmails = await buildCustomerEmailAddresses(pool, filters.includeCustomerEmails)
            if (!shouldIngestInboundEmail(companyInboxes, customerEmails, from, to, cc, filters)) {
              result.skipped++
              continue
            }

            const internetMessageId = String(parsed.messageId ?? msg.envelope?.messageId ?? '').trim()
            if (!internetMessageId) {
              result.skipped++
              continue
            }

            const ingest = await ingestInboundEmail(pool, {
              from,
              to,
              cc,
              subject: parsed.subject ?? msg.envelope?.subject ?? '',
              text: parsed.text ?? parsed.textAsHtml ?? '',
              html: typeof parsed.html === 'string' ? parsed.html : null,
              internetMessageId,
              inReplyTo: parsed.inReplyTo ?? null,
              references: Array.isArray(parsed.references)
                ? parsed.references.join(' ')
                : (parsed.references ?? null),
              receivedAt: msg.internalDate ?? parsed.date ?? new Date(),
              autoSubmitted: headerValue(parsed, 'auto-submitted'),
              precedence: headerValue(parsed, 'precedence'),
              attachments: parsed.attachments,
            }, filters)

            if (ingest.skipped) {
              result.skipped++
              if (ingest.repaired) result.repaired += ingest.repaired
            }
            else {
              result.ingested++
              result.attachments += ingest.attachmentCount ?? 0
            }
          }
          catch (err) {
            result.errors++
            console.error('[imap-sync] message ingest failed', err)
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
    const { rows: existingState } = await pool.query(
      `SELECT id FROM imap_sync_state WHERE id = 'default' LIMIT 1`,
    )
    if (existingState[0]) {
      await pool.query(
        `UPDATE imap_sync_state
         SET mailbox = $1, last_uid = $2, last_sync_at = $3, last_error = $4
         WHERE id = 'default'`,
        [
          config.mailbox,
          maxUid,
          now,
          result.errors ? `${result.errors} message(s) failed` : null,
        ],
      )
    }
    else {
      await pool.query(
        `INSERT INTO imap_sync_state (id, mailbox, last_uid, last_sync_at, last_error)
         VALUES ('default', $1, $2, $3, $4)`,
        [config.mailbox, maxUid, now, result.errors ? `${result.errors} message(s) failed` : null],
      )
    }

    if (result.ingested > 0) {
      console.log(`[imap-sync] ingested=${result.ingested} attachments=${result.attachments} skipped=${result.skipped} errors=${result.errors}`)
    }

    return result
  }
  finally {
    syncInProgress = false
  }
}

export function defaultSyncIntervalMs() {
  return Number(process.env.IMAP_SYNC_INTERVAL_MS ?? DEFAULT_SYNC_INTERVAL_MS)
}

/**
 * Run sync inline when the interval has elapsed (fast path for auto-responder).
 * @param {import('pg').Pool} pool
 */
export async function maybeRunImapInboxSync(pool) {
  const config = await loadImapConfig(pool)
  if (!config?.host || !config?.user) return null

  const intervalMs = defaultSyncIntervalMs()
  const { rows } = await pool.query(
    `SELECT last_sync_at FROM imap_sync_state WHERE id = 'default' LIMIT 1`,
  )
  const lastSync = rows[0]?.last_sync_at
  if (lastSync) {
    const elapsed = Date.now() - new Date(lastSync).getTime()
    if (elapsed < intervalMs) return null
  }

  return runImapInboxSync(pool)
}
