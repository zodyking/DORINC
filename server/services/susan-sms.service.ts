import { and, eq, isNull, ne } from 'drizzle-orm'
import type { Db } from '../db/client'
import {
  accountTypePermissions,
  accountTypes,
  permissions,
  userPermissionOverrides,
  users,
} from '../db/schema/auth'
import {
  susanSmsThreads,
  type SusanSmsHistoryMessage,
} from '../db/schema/susan-sms'
import { normalizePhoneE164 } from '../../shared/format/phone-e164'
import { stripHtmlToText } from '../../shared/email-display'
import type { PermissionKey } from '../../shared/permissions/keys'
import { evaluatePermission } from '../../shared/permissions/evaluate'
import { AI_ASSISTANT_NAME } from '../../shared/ai-assistant'
import { askPlatformHelp } from './platform-help.service'
import {
  getQuoConfig,
  isQuoSmsEnabled,
  sendQuoSms,
} from './quo.service'

const HISTORY_LIMIT = 40
const SMS_REPLY_MAX = 1500

function toPlainSms(htmlOrText: string): string {
  const stripped = stripHtmlToText(htmlOrText).replace(/\s+\n/g, '\n').trim()
  if (stripped.length <= SMS_REPLY_MAX) return stripped
  return `${stripped.slice(0, SMS_REPLY_MAX - 1).trimEnd()}…`
}

async function staffUserCanUseSusanHelp(
  db: Db,
  user: {
    id: string
    accountTypeKey: string
    isActive: boolean
    emailVerifiedAt: Date | null
    approvedAt: Date | null
  },
): Promise<boolean> {
  const [typeRow] = await db
    .select({ id: accountTypes.id })
    .from(accountTypes)
    .where(eq(accountTypes.key, user.accountTypeKey))
    .limit(1)
  if (!typeRow) return false

  const roleGrantRows = await db
    .select({ key: permissions.key })
    .from(accountTypePermissions)
    .innerJoin(permissions, eq(accountTypePermissions.permissionId, permissions.id))
    .where(eq(accountTypePermissions.accountTypeId, typeRow.id))

  const overrideRows = await db
    .select({
      key: permissions.key,
      effect: userPermissionOverrides.effect,
    })
    .from(userPermissionOverrides)
    .innerJoin(permissions, eq(userPermissionOverrides.permissionId, permissions.id))
    .where(eq(userPermissionOverrides.userId, user.id))

  const roleGrants = roleGrantRows.map(r => r.key as PermissionKey)
  const overrides = {
    allow: overrideRows.filter(r => r.effect === 'allow').map(r => r.key as PermissionKey),
    deny: overrideRows.filter(r => r.effect === 'deny').map(r => r.key as PermissionKey),
  }

  return evaluatePermission({
    user: {
      id: user.id,
      accountType: user.accountTypeKey,
      isActive: user.isActive,
      emailVerifiedAt: user.emailVerifiedAt,
      approvedAt: user.approvedAt,
    },
    roleGrants,
    overrides,
    required: 'ai.help.all',
  }).allowed
}

export async function findSmsEligibleStaffByPhone(db: Db, rawPhone: string) {
  const phone = normalizePhoneE164(rawPhone)
  if (!phone) return null

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      messageNotifyChannel: users.messageNotifyChannel,
      isActive: users.isActive,
      emailVerifiedAt: users.emailVerifiedAt,
      approvedAt: users.approvedAt,
      accountTypeKey: accountTypes.key,
    })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(and(
      eq(users.phone, phone),
      eq(users.isActive, true),
      isNull(users.disabledAt),
      ne(accountTypes.key, 'customer'),
    ))
    .limit(1)

  if (!row) return null
  if (row.messageNotifyChannel !== 'sms') return null
  return row
}

async function loadThreadHistory(db: Db, userId: string): Promise<SusanSmsHistoryMessage[]> {
  const [thread] = await db
    .select()
    .from(susanSmsThreads)
    .where(eq(susanSmsThreads.userId, userId))
    .limit(1)
  return Array.isArray(thread?.messages) ? thread.messages : []
}

async function saveThread(
  db: Db,
  input: {
    userId: string
    phone: string
    messages: SusanSmsHistoryMessage[]
    lastInboundMessageId?: string | null
  },
) {
  const now = new Date()
  const trimmed = input.messages.slice(-HISTORY_LIMIT)
  const [existing] = await db
    .select({ id: susanSmsThreads.id })
    .from(susanSmsThreads)
    .where(eq(susanSmsThreads.userId, input.userId))
    .limit(1)

  if (existing) {
    await db.update(susanSmsThreads).set({
      phone: input.phone,
      messages: trimmed,
      lastInboundMessageId: input.lastInboundMessageId ?? null,
      updatedAt: now,
    }).where(eq(susanSmsThreads.id, existing.id))
    return
  }

  await db.insert(susanSmsThreads).values({
    userId: input.userId,
    phone: input.phone,
    messages: trimmed,
    lastInboundMessageId: input.lastInboundMessageId ?? null,
    createdAt: now,
    updatedAt: now,
  })
}

/**
 * Handle an inbound Quo SMS as a Susan AI platform-help turn.
 * Only text-enabled staff users are answered.
 */
export async function handleInboundSusanSms(
  db: Db,
  input: {
    fromPhone: string
    toPhone?: string | null
    body: string
    messageId?: string | null
  },
): Promise<{ handled: boolean, reason?: string }> {
  const question = String(input.body || '').trim()
  if (!question) return { handled: false, reason: 'empty_body' }

  const config = await getQuoConfig(db)
  if (!isQuoSmsEnabled(config)) return { handled: false, reason: 'quo_disabled' }

  const from = normalizePhoneE164(input.fromPhone)
  if (!from) return { handled: false, reason: 'invalid_from' }

  // Ignore echoes from our own Quo number.
  const self = normalizePhoneE164(config.fromNumber)
  if (self && from === self) return { handled: false, reason: 'self_message' }

  const user = await findSmsEligibleStaffByPhone(db, from)
  if (!user) {
    // Quietly ignore unknown / email-channel users so we don't spam.
    return { handled: false, reason: 'not_eligible' }
  }

  if (input.messageId) {
    const [thread] = await db
      .select({ lastInboundMessageId: susanSmsThreads.lastInboundMessageId })
      .from(susanSmsThreads)
      .where(eq(susanSmsThreads.userId, user.id))
      .limit(1)
    if (thread?.lastInboundMessageId && thread.lastInboundMessageId === input.messageId) {
      return { handled: false, reason: 'duplicate' }
    }
  }

  const canHelp = await staffUserCanUseSusanHelp(db, user)
  if (!canHelp) {
    await sendQuoSms({
      apiKey: config.apiKey,
      from: config.fromNumber,
      to: from,
      content: `${AI_ASSISTANT_NAME} SMS help is not enabled for your account. Use the in-app help chat if available, or contact an administrator.`,
    })
    return { handled: true, reason: 'no_permission' }
  }

  const history = await loadThreadHistory(db, user.id)
  const helpHistory = history.map(m => ({
    role: m.role,
    content: m.content,
  }))

  const result = await askPlatformHelp(db, {
    question,
    pageContext: 'SMS chat with Susan AI',
    userId: user.id,
    history: helpHistory,
  })

  const answerText = toPlainSms(result.answer) || 'I could not generate a reply just now. Please try again in a moment.'

  await sendQuoSms({
    apiKey: config.apiKey,
    from: config.fromNumber,
    to: from,
    content: answerText,
  })

  const nowIso = new Date().toISOString()
  await saveThread(db, {
    userId: user.id,
    phone: from,
    lastInboundMessageId: input.messageId ?? null,
    messages: [
      ...history,
      { role: 'user', content: question, at: nowIso },
      { role: 'assistant', content: answerText, at: nowIso },
    ],
  })

  return { handled: true }
}
