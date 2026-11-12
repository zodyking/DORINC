import { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import nodemailer from 'nodemailer'
import type { Db } from '../../db/client'
import {
  PRINTER_ALLOWED_EXTENSIONS,
  customerMailLine,
  evaluateMailMessage,
} from '../../../shared/printers'
import {
  jobsWithPrefixStatus,
  printerSettingsMap,
  recordPrinterEvent,
  rememberMailBatch,
  setMailBatchPhase,
  setPrinterSetting,
} from './store'
import { printerBlock, recordRejection, releaseQueues, submitFile } from './engine'
import { PrintError } from './errors'

type MailState = { checked: string | null, state: string, detail: string }

let LAST: MailState = { checked: null, state: 'Not configured', detail: '' }
const drops: number[] = []
let dropWarned = false

export function publishMail(update: Partial<MailState>) {
  LAST = { ...LAST, ...update }
}

export function mailSnapshot(): MailState {
  return { ...LAST }
}

function ready(config: Record<string, string>): boolean {
  if (config.mail_enabled !== '1') {
    publishMail({ state: 'Disabled', detail: 'Turn on email printing, then save.' })
    return false
  }
  if (!config.imap_host || !config.imap_user || !config.imap_password || !config.default_queue) {
    publishMail({ state: 'Needs setup', detail: 'Mailbox login and a default printer are required' })
    return false
  }
  return true
}

function cursorKey(config: Record<string, string>) {
  return `${(config.imap_host || '').trim()}\n${(config.imap_user || '').trim()}\n${(config.imap_folder || 'INBOX').trim() || 'INBOX'}`
}

async function adoptCursor(db: Db, config: Record<string, string>, uidvalidity: number, uidnext: number) {
  const key = cursorKey(config)
  const validity = String(uidvalidity)
  const lastRaw = String(config.mail_last_uid || '')
  if (config.mail_watch === key && config.mail_uidvalidity === validity && /^\d+$/.test(lastRaw)) {
    return { last: Number(lastRaw), primed: false }
  }
  const last = Math.max(uidnext - 1, 0)
  await setPrinterSetting(db, 'mail_watch', key)
  await setPrinterSetting(db, 'mail_uidvalidity', validity)
  await setPrinterSetting(db, 'mail_last_uid', String(last))
  return { last, primed: true }
}

function addressesOf(value: string | undefined): string {
  return value || ''
}

export async function handleMailMessage(db: Db, msg: ParsedMail, jobPrefix: string, config: Record<string, string>) {
  const from = addressesOf(msg.from?.value?.[0]?.address || msg.from?.text)
  const to = (msg.to && 'value' in msg.to ? msg.to.value : []).map((item: { address?: string }) => item.address || '').join(',')
  const cc = (msg.cc && 'value' in msg.cc ? msg.cc.value : []).map((item: { address?: string }) => item.address || '').join(',')
  const evaluated = evaluateMailMessage({
    from,
    to,
    cc,
    subject: msg.subject || '',
    config,
  })
  const queue = config.default_queue || ''
  if (!evaluated.ok || !evaluated.command) {
    await recordRejection(db, (msg.subject || 'Email').slice(0, 180), evaluated.reason, queue, 'email', evaluated.sender, jobPrefix)
    await recordPrinterEvent(db, 'warning', `Email rejected: ${evaluated.reason}`)
    return { accepted: false, jobs: 0, errors: 0, reason: evaluated.reason, queue, notes: [] as string[], files: [] as Array<{ name: string, detail: string }> }
  }
  const maxFiles = Math.max(1, Math.min(Number(config.max_files || 5), 10))
  const parts: Array<{ name: string, data: Buffer }> = []
  for (const att of msg.attachments || []) {
    const name = att.filename || ''
    if (!name) continue
    const suffix = name.includes('.') ? `.${name.split('.').pop()!.toLowerCase()}` : ''
    if ((PRINTER_ALLOWED_EXTENSIONS as readonly string[]).includes(suffix)) {
      parts.push({ name, data: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content || []) })
    }
  }
  if (parts.length > maxFiles) {
    await recordPrinterEvent(db, 'warning', `Email from ${evaluated.sender} included ${parts.length} attachments; only ${maxFiles} were printed`)
  }
  if (!parts.length && config.print_email_body === '1' && msg.text?.trim()) {
    parts.push({ name: 'email.txt', data: Buffer.from(msg.text, 'utf8') })
  }
  if (!parts.length) {
    const reason = 'Email contained no supported attachments'
    await recordRejection(db, (msg.subject || 'Email').slice(0, 180), reason, queue, 'email', evaluated.sender, jobPrefix, evaluated.command.copies, evaluated.command.sides)
    await recordPrinterEvent(db, 'warning', reason)
    return {
      accepted: true, jobs: 0, errors: 1, reason, queue,
      notes: [reason], files: [], copies: evaluated.command.copies, sides: evaluated.command.sides,
    }
  }
  let success = 0
  let fail = 0
  const notes: string[] = []
  const files: Array<{ name: string, detail: string }> = []
  let failure = ''
  let created = false
  for (const [i, part] of parts.slice(0, maxFiles).entries()) {
    const dedupe = `${jobPrefix}:${i}`
    try {
      await submitFile(db, {
        filename: part.name,
        data: part.data,
        queue,
        copies: evaluated.command.copies,
        sides: evaluated.command.sides,
        source: 'email',
        sender: evaluated.sender,
        dedupe,
        release: false,
      })
      success += 1
      created = true
      notes.push(`${part.name} received for ${queue}`)
      files.push({ name: part.name, detail: 'Received' })
    }
    catch (err) {
      const detail = String(err instanceof Error ? err.message : err).slice(0, 180)
      if (!failure) failure = detail
      await recordPrinterEvent(db, 'error', `Email attachment ${part.name.slice(0, 90)}: ${detail.slice(0, 230)}`)
      notes.push(`${part.name}: ${detail}`)
      files.push({ name: part.name, detail })
      fail += 1
      if (err instanceof PrintError && err.message.includes('already processed')) created = created || false
    }
  }
  const base = {
    accepted: true,
    jobs: success,
    errors: fail,
    reason: success ? '' : failure,
    queue,
    notes,
    files,
    copies: evaluated.command.copies,
    sides: evaluated.command.sides,
    held: false,
    notices: [] as unknown[],
    issues: [] as string[],
  }
  if (!success || !created) return base
  await rememberMailBatch(db, jobPrefix, evaluated.sender, String(msg.subject || ''), String(msg.messageId || ''), queue)
  await releaseQueues(db)
  if ((await jobsWithPrefixStatus(db, jobPrefix, 'submitted')).length) {
    await setMailBatchPhase(db, jobPrefix, 'sent')
    return base
  }
  if (!(await jobsWithPrefixStatus(db, jobPrefix, 'pending')).length) return base
  const block = await printerBlock(db, queue) || { issues: ['The printer is not ready.'] }
  await setMailBatchPhase(db, jobPrefix, 'held')
  base.held = true
  base.issues = block.issues
  base.reason = block.issues.join(' ')
  return base
}

export async function listMailFolders(config: Record<string, string>): Promise<string[]> {
  const client = new ImapFlow({
    host: config.imap_host || 'imap.gmail.com',
    port: Number(config.imap_port || 993),
    secure: true,
    auth: { user: config.imap_user || '', pass: config.imap_password || '' },
    logger: false,
  })
  await client.connect()
  try {
    const folders = await client.list()
    const names = folders.map(item => item.path).filter(Boolean)
    if (!names.length) throw new Error('The mailbox returned no folders')
    return names
  }
  finally {
    try { await client.logout() }
    catch { /* ignore */ }
  }
}

function transientMail(detail: string): boolean {
  const low = detail.toLowerCase()
  return [
    'timed out', 'timeout', 'connection closed', 'connection reset', 'broken pipe',
    'socket error', 'eof', 'mailbox watch stopped', 'cannot read from timed out',
    'temporarily unavailable',
  ].some(phrase => low.includes(phrase))
}

function noteMailDrop() {
  const now = Date.now()
  while (drops.length && now - drops[0]! > 1_800_000) drops.shift()
  drops.push(now)
  if (drops.length >= 4 && !dropWarned) {
    dropWarned = true
  }
  if (drops.length < 4) dropWarned = false
  publishMail({ state: 'Watching', detail: 'Reconnecting to the mailbox.' })
}

async function notifySender(db: Db, msg: ParsedMail, config: Record<string, string>, result: { accepted: boolean, reason?: string, jobs?: number, files?: Array<{ name: string, detail: string }> }) {
  if (config.reply_enabled !== '1') return
  const to = msg.from?.value?.[0]?.address
  if (!to) return
  const from = config.smtp_from || config.imap_user
  const transporter = nodemailer.createTransport({
    host: config.smtp_host || 'smtp.gmail.com',
    port: Number(config.smtp_port || 587),
    secure: Number(config.smtp_port || 587) === 465,
    auth: { user: config.imap_user, pass: config.imap_password },
  })
  const ok = result.accepted && !result.reason
  const title = ok ? 'Printed' : 'Could not print'
  const detail = customerMailLine(result.reason || (ok ? 'Printed' : 'It could not be printed.'))
  await transporter.sendMail({
    from,
    to,
    subject: title,
    text: `${title}\n\n${detail}`,
    html: `<p><strong>${title}</strong></p><p>${detail}</p>`,
  })
  void db
}

export async function checkPrinterMail(db: Db): Promise<void> {
  const config = await printerSettingsMap(db)
  if (!ready(config)) {
    publishMail({ checked: new Date().toISOString() })
    return
  }
  const folder = config.imap_folder || 'INBOX'
  const client = new ImapFlow({
    host: config.imap_host || 'imap.gmail.com',
    port: Number(config.imap_port || 993),
    secure: true,
    auth: { user: config.imap_user || '', pass: config.imap_password || '' },
    logger: false,
  })
  try {
    await client.connect()
    const lock = await client.getMailboxLock(folder)
    try {
      const mailbox = client.mailbox
      if (!mailbox) throw new Error('Cannot select IMAP folder')
      const uidvalidity = Number(mailbox.uidValidity || 0)
      const uidnext = Number(mailbox.uidNext || 1)
      const { last, primed } = await adoptCursor(db, config, uidvalidity, uidnext)
      if (primed) {
        publishMail({ state: 'Watching', detail: `Watching ${folder} for new mail. Mail already there is left alone.`, checked: new Date().toISOString() })
        return
      }
      const uids: number[] = []
      for await (const msg of client.fetch({ uid: `${last + 1}:*` }, { uid: true, source: true }, { uid: true })) {
        if (msg.uid && msg.uid > last) uids.push(msg.uid)
      }
      const pending = uids.slice(0, 35)
      if (!pending.length) {
        publishMail({ state: 'Watching', detail: `Watching ${folder} for new mail.`, checked: new Date().toISOString() })
        return
      }
      let count = 0
      let problems = 0
      let waiting = 0
      for await (const msg of client.fetch({ uid: pending.join(',') }, { uid: true, source: true, envelope: true }, { uid: true })) {
        const uidText = String(msg.uid)
        const source = msg.source
        if (!source) {
          await recordPrinterEvent(db, 'warning', 'Could not read a new email')
          problems += 1
        }
        else {
          const parsed = await simpleParser(source)
          const key = `${config.imap_user}:${uidvalidity}:${uidText}`
          const result = await handleMailMessage(db, parsed, key, config)
          if (!result.accepted || result.errors) problems += 1
          else if ('held' in result && result.held) waiting += 1
          try { await notifySender(db, parsed, config, result) }
          catch (err) {
            const secret = config.imap_password || ''
            await recordPrinterEvent(db, 'error', `Result email failed: ${String(err instanceof Error ? err.message : err).replace(secret, '').slice(0, 300)}`)
          }
        }
        try { await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true }) }
        catch { await recordPrinterEvent(db, 'warning', 'Could not mark a handled email as seen') }
        await setPrinterSetting(db, 'mail_last_uid', uidText)
        count += 1
      }
      let state = 'Watching'
      let detail = 'Watching the folder for new mail'
      if (problems) {
        state = 'Attention'
        detail = `${problems} of ${count || problems} new messages were rejected or failed`
      }
      else if (waiting) {
        state = 'Watching'
        detail = `${waiting} new message(s) are waiting for the printer`
      }
      else if (count) {
        state = 'Healthy'
        detail = `Printed ${count} new message(s) from the folder`
      }
      publishMail({ state, detail, checked: new Date().toISOString() })
    }
    finally {
      lock.release()
    }
  }
  catch (err) {
    const secret = config.imap_password || ''
    const detail = String(err instanceof Error ? err.message : err).replace(secret, '')
    if (transientMail(detail)) {
      noteMailDrop()
      if (dropWarned) await recordPrinterEvent(db, 'warning', 'The mailbox connection keeps dropping. PrintHarbor is reconnecting.')
    }
    else {
      publishMail({ state: 'Error', detail: detail.slice(0, 170) })
      await recordPrinterEvent(db, 'error', `Mail check failed: ${detail.slice(0, 300)}`)
    }
    publishMail({ checked: new Date().toISOString() })
  }
  finally {
    try { await client.logout() }
    catch { /* ignore */ }
  }
}
