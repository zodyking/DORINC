// Notify all team members when a customer email is synced into Messages (worker path).
import { buildCustomerEmailReceivedStaffEmail } from '../../mail/templates/system.mjs'

const NOTIFICATION_SETTINGS_KEY = 'workspace.notification_settings'

function stripHtmlToText(html) {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function customerEmailStaffMessageBody(body, html) {
  const plain = String(body ?? '').replace(/\r\n/g, '\n').trim()
  const source = plain || (html ? stripHtmlToText(html) : '')
  return source || '(empty message)'
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

export async function isCustomerEmailStaffNotifyEnabled(pool) {
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    [NOTIFICATION_SETTINGS_KEY],
  )
  const settings = rows[0]?.value || {}
  return settings.customerEmailReceived !== false
}

export async function listTeamMembersForStaffEmail(pool) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email
     FROM users u
     INNER JOIN account_types at ON at.id = u.account_type_id
     WHERE u.is_active = true
       AND u.approved_at IS NOT NULL
       AND at.key <> 'customer'
       AND u.email IS NOT NULL
       AND btrim(u.email) <> ''`,
  )
  return rows
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   conversationId: string,
 *   customerName: string,
 *   customerEmail: string,
 *   subject: string,
 *   messageBody: string,
 *   htmlBody?: string | null,
 * }} opts
 */
export async function notifyCustomerEmailReceivedStaff(pool, opts) {
  if (!(await isCustomerEmailStaffNotifyEnabled(pool))) {
    return { queued: 0, reason: 'disabled' }
  }

  const brand = await loadEmailBrand(pool)
  const baseUrl = brand.appUrl.replace(/\/$/, '')
  const messagesUrl = `${baseUrl}/messages?conversation=${opts.conversationId}`
  const messagePreview = customerEmailStaffMessageBody(opts.messageBody, opts.htmlBody)
  const recipients = await listTeamMembersForStaffEmail(pool)

  if (!recipients.length) {
    return { queued: 0, reason: 'no_recipients' }
  }

  let queued = 0
  for (const recipient of recipients) {
    const mail = buildCustomerEmailReceivedStaffEmail({
      recipientName: recipient.name || 'Team member',
      customerName: opts.customerName,
      customerEmail: opts.customerEmail,
      subject: opts.subject,
      messagePreview,
      messagesUrl,
      appUrl: brand.appUrl,
      brand,
    })

    await pool.query(
      `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
       VALUES ('email_send', $1, 'queued', 0, 3, now())`,
      [JSON.stringify({
        to: recipient.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        notificationKind: 'customer_email_received',
        conversationId: opts.conversationId,
        recipientUserId: recipient.id,
      })],
    )
    queued++
  }

  if (queued > 0) {
    console.log(`[imap-sync] queued ${queued} customer-email staff notification(s) for conversation ${opts.conversationId}`)
  }

  return { queued }
}
