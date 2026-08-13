import type { Db } from '../db/client'
import { resolveDorincContactPhone } from './dorinc-contact.service'
import { enqueueTemplatedSms } from './sms-notifications.service'

/**
 * After Text notifications are enabled, send the Dorinc contact-card SMS
 * with the Quo from-number (no site URL — iPhone link previews look bad).
 */
export async function sendDorincContactCardSms(
  db: Db,
  opts: {
    userId: string
    name: string
    phone: string
  },
) {
  const quoPhone = await resolveDorincContactPhone(db)
  if (!quoPhone) {
    return { contactQueued: false as const, reason: 'quo_disabled' as const }
  }

  const contact = await enqueueTemplatedSms(db, {
    to: opts.phone,
    typeKey: 'dorinc_contact_card',
    vars: {
      name: opts.name,
      fromNumber: quoPhone,
    },
    meta: {
      recipientUserId: opts.userId,
      notificationKind: 'dorinc_contact_card',
    },
  })

  return { contactQueued: contact.queued }
}

/** @deprecated use sendDorincContactCardSms */
export const sendDorincContactCardAndScheduleSusanIntro = sendDorincContactCardSms
