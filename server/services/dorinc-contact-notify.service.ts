import type { Db } from '../db/client'
import {
  getDorincContactVcardUrl,
  resolveDorincContactPhone,
} from './dorinc-contact.service'
import { enqueueTemplatedSms } from './sms-notifications.service'

/**
 * After Text notifications are enabled, send the Dorinc contact-card SMS
 * (vCard download link — Quo API has no MMS).
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

  const contactUrl = await getDorincContactVcardUrl(db)
  const contact = await enqueueTemplatedSms(db, {
    to: opts.phone,
    typeKey: 'dorinc_contact_card',
    vars: {
      name: opts.name,
      contactUrl,
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
