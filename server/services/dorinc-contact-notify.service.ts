import type { Db } from '../db/client'
import {
  dorincContactLabels,
  getDorincContactVcardUrl,
  resolveDorincContactPhone,
} from './dorinc-contact.service'
import {
  enqueueTemplatedSms,
  enqueueTemplatedSmsLater,
} from './sms-notifications.service'

const SUSAN_INTRO_DELAY_MS = 5 * 60 * 1000

/**
 * After Text notifications are enabled:
 * 1) Send a Dorinc contact-card SMS (vCard download — Quo API has no MMS).
 * 2) Schedule a Susan AI intro SMS five minutes later.
 */
export async function sendDorincContactCardAndScheduleSusanIntro(
  db: Db,
  opts: {
    userId: string
    name: string
    phone: string
  },
) {
  const quoPhone = await resolveDorincContactPhone(db)
  if (!quoPhone) {
    return { contactQueued: false as const, introScheduled: false as const, reason: 'quo_disabled' as const }
  }

  const contactUrl = await getDorincContactVcardUrl(db)
  const labels = dorincContactLabels()

  const contact = await enqueueTemplatedSms(db, {
    to: opts.phone,
    typeKey: 'dorinc_contact_card',
    vars: {
      name: opts.name,
      contactName: labels.displayName,
      phoneLabel: labels.phoneLabel,
      quoPhone,
      contactUrl,
    },
    meta: {
      recipientUserId: opts.userId,
      notificationKind: 'dorinc_contact_card',
    },
  })

  const intro = await enqueueTemplatedSmsLater(db, {
    to: opts.phone,
    typeKey: 'susan_sms_ready',
    vars: { name: opts.name },
    runAfter: new Date(Date.now() + SUSAN_INTRO_DELAY_MS),
    meta: {
      recipientUserId: opts.userId,
      notificationKind: 'susan_sms_ready',
    },
  })

  return {
    contactQueued: contact.queued,
    introScheduled: intro.queued,
  }
}
