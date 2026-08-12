import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users } from '../db/schema/auth'
import { normalizePhoneE164 } from '../../shared/format/phone-e164'
import type { MessageNotifyChannel } from '../../shared/validators/quo'
import { isQuoEnabled } from './quo.service'

export type NotifyDelivery
  = { channel: 'email', email: string }
    | { channel: 'sms', phone: string, email: string }

/**
 * Resolve how to deliver a security/chat notification for a user.
 * SMS only when Quo is enabled, user prefers SMS, and a valid phone is on file.
 */
export async function resolveUserNotifyDelivery(
  db: Db,
  user: {
    email: string
    phone?: string | null
    messageNotifyChannel?: string | null
    messageEmailNotify?: boolean | null
  },
  opts?: { requireChatOptIn?: boolean },
): Promise<NotifyDelivery | null> {
  const email = user.email?.trim()
  if (!email) return null

  // Never let a settings/Quo read failure cancel the notification — email is
  // the safe default, and security mail must not depend on SMS config health.
  let quoOn = false
  try {
    quoOn = await isQuoEnabled(db)
  }
  catch (err) {
    console.warn('[notify] Quo lookup failed; delivering by email:', (err as Error).message)
  }
  if (quoOn) {
    const channel = (user.messageNotifyChannel === 'sms' ? 'sms' : 'email') as MessageNotifyChannel
    if (channel === 'sms') {
      const phone = normalizePhoneE164(user.phone)
      if (phone) return { channel: 'sms', phone, email }
      console.warn('[notify] SMS preferred but phone missing/invalid; falling back to email for', email)
    }
    return { channel: 'email', email }
  }

  if (opts?.requireChatOptIn && user.messageEmailNotify === false) {
    return null
  }
  return { channel: 'email', email }
}

export async function loadUserNotifyProfile(db: Db, userId: string) {
  const [row] = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    phone: users.phone,
    messageNotifyChannel: users.messageNotifyChannel,
    messageEmailNotify: users.messageEmailNotify,
  })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return row ?? null
}
