import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import {
  susanSmsThreads,
  type SusanSmsHistoryMessage,
} from '../db/schema/susan-sms'
import { normalizePhoneE164 } from '../../shared/format/phone-e164'
import { formatPlatformHelpForSms } from '../../shared/platform-help'
import { parseSusanSmsPendingAction, type SusanSmsPendingAction } from '../../shared/susan-sms-actions'
import { askPlatformHelp } from './platform-help.service'
import { handleSusanSmsActionTurn } from './susan-sms-actions.service'
import {
  getQuoConfig,
  isQuoSmsEnabled,
  sendQuoSms,
} from './quo.service'

const HISTORY_LIMIT = 20

function phoneDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

export type ActiveSmsUser = {
  id: string
  name: string
  email: string
  phone: string | null
  messageNotifyChannel: string | null
}

/**
 * Find the active staff user who sent this SMS.
 * Must be active, not suspended, not a customer, and on Text notifications.
 */
export async function findActiveTextUserByPhone(
  db: Db,
  rawPhone: string,
): Promise<ActiveSmsUser | null> {
  const phone = normalizePhoneE164(rawPhone)
  if (!phone) return null
  const last10 = phoneDigits(phone).slice(-10)
  if (last10.length < 10) return null

  const select = {
    id: users.id,
    name: users.name,
    email: users.email,
    phone: users.phone,
    messageNotifyChannel: users.messageNotifyChannel,
  }

  const [exact] = await db
    .select(select)
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.phone, phone),
      eq(users.isActive, true),
      isNull(users.disabledAt),
      ne(accountTypes.key, 'customer'),
      eq(users.messageNotifyChannel, 'sms'),
    ))
    .limit(1)
  if (exact) return exact

  const [fuzzy] = await db
    .select(select)
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      sql`right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10) = ${last10}`,
      eq(users.isActive, true),
      isNull(users.disabledAt),
      ne(accountTypes.key, 'customer'),
      eq(users.messageNotifyChannel, 'sms'),
    ))
    .limit(1)

  return fuzzy ?? null
}

async function loadThread(db: Db, userId: string): Promise<{
  messages: SusanSmsHistoryMessage[]
  pendingAction: SusanSmsPendingAction | null
}> {
  const [thread] = await db
    .select()
    .from(susanSmsThreads)
    .where(eq(susanSmsThreads.userId, userId))
    .limit(1)
  return {
    messages: Array.isArray(thread?.messages) ? thread.messages : [],
    pendingAction: parseSusanSmsPendingAction(thread?.pendingAction),
  }
}

async function saveHistory(
  db: Db,
  input: {
    userId: string
    phone: string
    messages: SusanSmsHistoryMessage[]
    lastInboundMessageId?: string | null
    pendingAction?: SusanSmsPendingAction | null
  },
) {
  const now = new Date()
  const messages = input.messages.slice(-HISTORY_LIMIT)
  const [existing] = await db
    .select({ id: susanSmsThreads.id })
    .from(susanSmsThreads)
    .where(eq(susanSmsThreads.userId, input.userId))
    .limit(1)

  if (existing) {
    await db.update(susanSmsThreads).set({
      phone: input.phone,
      messages,
      lastInboundMessageId: input.lastInboundMessageId ?? null,
      pendingAction: input.pendingAction ?? null,
      updatedAt: now,
    }).where(eq(susanSmsThreads.id, existing.id))
    return
  }

  await db.insert(susanSmsThreads).values({
    userId: input.userId,
    phone: input.phone,
    messages,
    lastInboundMessageId: input.lastInboundMessageId ?? null,
    pendingAction: input.pendingAction ?? null,
    createdAt: now,
    updatedAt: now,
  })
}

/**
 * Simple Susan SMS pipeline:
 * 1) detect new SMS (caller)
 * 2) determine who sent it
 * 3) check active user details (active + Text channel)
 * 4) numbered menu / YES-NO actions, else AI
 * 5) Quo API sends reply
 */
export async function handleInboundSusanSms(
  db: Db,
  input: {
    fromPhone: string
    toPhone?: string | null
    body: string
    messageId?: string | null
  },
): Promise<{ handled: boolean, reason?: string, userId?: string }> {
  // 1) Detect / validate inbound SMS content
  const question = String(input.body || '').trim()
  if (!question) {
    console.info('[susan-sms] skip: empty body')
    return { handled: false, reason: 'empty_body' }
  }

  const config = await getQuoConfig(db)
  if (!isQuoSmsEnabled(config)) {
    console.info('[susan-sms] skip: quo disabled')
    return { handled: false, reason: 'quo_disabled' }
  }

  // 2) Determine who sent it
  const from = normalizePhoneE164(input.fromPhone)
  if (!from) {
    console.info('[susan-sms] skip: invalid from', { fromPhone: input.fromPhone })
    return { handled: false, reason: 'invalid_from' }
  }
  const self = normalizePhoneE164(config.fromNumber)
  if (self && from === self) {
    return { handled: false, reason: 'self_message' }
  }

  // 3) Check active user details (active staff on Text)
  const user = await findActiveTextUserByPhone(db, from)
  if (!user) {
    console.info('[susan-sms] skip: no active text user for phone', { from })
    return { handled: false, reason: 'not_eligible' }
  }

  if (input.messageId) {
    const [thread] = await db
      .select({ lastInboundMessageId: susanSmsThreads.lastInboundMessageId })
      .from(susanSmsThreads)
      .where(eq(susanSmsThreads.userId, user.id))
      .limit(1)
    if (thread?.lastInboundMessageId === input.messageId) {
      return { handled: false, reason: 'duplicate', userId: user.id }
    }
  }

  console.info('[susan-sms] step: user matched', {
    userId: user.id,
    name: user.name,
    from,
    messageId: input.messageId,
  })

  // 4) Numbered menu / YES-NO confirm, else the same Platform Assistant as in-app
  const thread = await loadThread(db, user.id)
  const actionTurn = await handleSusanSmsActionTurn(db, {
    userId: user.id,
    userName: user.name,
    question,
    pending: thread.pendingAction,
  })

  let answerText: string
  let pendingAction: SusanSmsPendingAction | null

  if (actionTurn.handled && actionTurn.reply) {
    answerText = actionTurn.reply
    pendingAction = actionTurn.pendingAction ?? null
    console.info('[susan-sms] step: action menu', {
      userId: user.id,
      pendingKind: pendingAction?.kind ?? null,
    })
  }
  else {
    const result = await askPlatformHelp(db, {
      question,
      userId: user.id,
      userName: user.name,
      channel: 'sms',
      history: thread.messages.map(m => ({ role: m.role, content: m.content })),
    })
    answerText = formatPlatformHelpForSms(result.answer)
      || `Hi — I'm Susan. I could not generate a reply just now. Please try again in a moment.`
    pendingAction = result.pendingAction ?? null
  }

  // 5) Quo API sends reply
  await sendQuoSms({
    apiKey: config.apiKey,
    from: config.fromNumber,
    to: from,
    content: answerText,
  })

  const nowIso = new Date().toISOString()
  await saveHistory(db, {
    userId: user.id,
    phone: from,
    lastInboundMessageId: input.messageId ?? null,
    pendingAction,
    messages: [
      ...thread.messages,
      { role: 'user', content: question, at: nowIso },
      { role: 'assistant', content: answerText, at: nowIso },
    ],
  })

  console.info('[susan-sms] step: replied', {
    userId: user.id,
    from,
    answerChars: answerText.length,
  })

  return { handled: true, userId: user.id }
}

/** @deprecated use findActiveTextUserByPhone */
export const findSmsEligibleStaffByPhone = findActiveTextUserByPhone
