import type { Db } from '../db/client'
import { enqueueJob } from './jobs.service'
import { enqueueTemplatedSms } from './sms-notifications.service'
import {
  resolveUserNotifyDelivery,
  type NotifyDelivery,
} from './user-notify-channel.service'

export type DeliveredChannel = 'sms' | 'email' | 'none'

/**
 * Deliver a staff/security notification by the recipient's Email vs Text preference.
 * When SMS is preferred, try SMS first; fall back to email only if SMS cannot queue
 * (unless emailFallback is false).
 */
export async function deliverUserNotification(
  db: Db,
  user: {
    id?: string | null
    email: string
    phone?: string | null
    messageNotifyChannel?: string | null
    messageEmailNotify?: boolean | null
  },
  opts: {
    requireChatOptIn?: boolean
    sms?: {
      typeKey: string
      vars: Record<string, string | null | undefined>
    }
    email: { subject: string, text: string, html: string }
    meta?: Record<string, unknown>
    /** Default true — security/workflow should still reach the user if SMS fails. */
    emailFallback?: boolean
  },
): Promise<{ channel: DeliveredChannel, reason?: string }> {
  const delivery = await resolveUserNotifyDelivery(db, user, {
    requireChatOptIn: opts.requireChatOptIn,
  })
  if (!delivery) return { channel: 'none', reason: 'no_delivery' }

  const meta = {
    ...(user.id ? { recipientUserId: user.id } : {}),
    ...(opts.meta ?? {}),
  }

  if (delivery.channel === 'sms' && opts.sms) {
    const smsResult = await enqueueTemplatedSms(db, {
      to: delivery.phone,
      typeKey: opts.sms.typeKey,
      vars: opts.sms.vars,
      meta,
    })
    if (smsResult.queued) return { channel: 'sms' }
    if (opts.emailFallback === false) {
      return { channel: 'none', reason: smsResult.reason }
    }
  }

  await enqueueJob(db, 'email_send', {
    to: delivery.email,
    subject: opts.email.subject,
    text: opts.email.text,
    html: opts.email.html,
    ...meta,
  })
  return { channel: 'email' }
}

export async function resolveDeliveryOrEmail(
  db: Db,
  user: {
    email: string
    phone?: string | null
    messageNotifyChannel?: string | null
    messageEmailNotify?: boolean | null
  },
  opts?: { requireChatOptIn?: boolean },
): Promise<NotifyDelivery | null> {
  return resolveUserNotifyDelivery(db, user, opts)
}
