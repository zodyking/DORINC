#!/usr/bin/env node
/**
 * Export reference HTML previews for every DORINC email template.
 * Run: node scripts/export-email-templates.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildBackupNotificationEmail,
  buildInvoiceAttachedEmail,
  buildPortalCredentialEmail,
  buildSignupVerificationEmail,
  buildSmtpTestEmail,
} from '../server/mail/templates/system.mjs'
import {
  buildStyledEmail,
  emailBadge,
  emailButton,
  emailMuted,
  emailParagraph,
  escapeHtml,
} from '../server/mail/email-layout.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'Agent-Files', 'email')
const APP_URL = 'https://app.dorinc.example.com'

function portalUrl(path = '') {
  return `${APP_URL.replace(/\/$/, '')}/portal${path}`
}

function buildInvoiceSentEmail(input) {
  const detailUrl = portalUrl(`/invoices/${input.invoiceId}`)
  const dueLine = input.dueDate ? `Due date: ${input.dueDate}` : null
  const totalLine = input.total ? `Total: ${input.total}` : null
  const subject = `Invoice ${input.invoiceNumber} is ready`
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Invoice ${input.invoiceNumber} has been sent and is available in your customer portal.`,
    dueLine,
    totalLine,
    '',
    `View invoice: ${detailUrl}`,
  ].filter(Boolean).join('\n')
  const metaBits = [dueLine, totalLine].filter(Boolean).map(line => emailMuted(escapeHtml(line))).join('')
  return buildStyledEmail({
    subject,
    text,
    title: `Invoice ${input.invoiceNumber}`,
    preheader: `Invoice ${input.invoiceNumber} is ready in your portal`,
    bodyHtml: [
      emailParagraph(`Hello ${escapeHtml(input.recipientName)},`),
      emailParagraph(`Invoice <strong>${escapeHtml(input.invoiceNumber)}</strong> has been sent and is available in your customer portal.`),
      metaBits,
      emailButton(detailUrl, 'View invoice in the portal'),
      emailMuted('If you have questions, reply to this email or submit a request through the portal.'),
    ].join(''),
    appUrl: APP_URL,
  })
}

function buildRequestStatusEmail(input) {
  const kindLabels = {
    service: 'Service request',
    invoice_change: 'Billing correction request',
    vehicle_change: 'Vehicle correction request',
    general: 'General request',
    new_vehicle: 'New vehicle request',
  }
  const kindLabel = kindLabels[input.requestKind]
  const statusLabel = input.status === 'approved' ? 'approved' : 'rejected'
  const subject = `${kindLabel} ${statusLabel}`
  const reasonLine = input.reviewReason?.trim() ? `Staff note: ${input.reviewReason.trim()}` : null
  const requestsUrl = portalUrl('/requests')
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Your ${kindLabel.toLowerCase()} "${input.requestTitle}" has been ${statusLabel}.`,
    reasonLine,
    '',
    `Track requests: ${requestsUrl}`,
  ].filter(Boolean).join('\n')
  const badgeTone = input.status === 'approved' ? 'ok' : 'error'
  return buildStyledEmail({
    subject,
    text,
    title: subject,
    preheader: `Your ${kindLabel.toLowerCase()} was ${statusLabel}`,
    bodyHtml: [
      emailBadge(statusLabel, badgeTone),
      emailParagraph(`Hello ${escapeHtml(input.recipientName)},`),
      emailParagraph(`Your <strong>${escapeHtml(kindLabel.toLowerCase())}</strong> &ldquo;${escapeHtml(input.requestTitle)}&rdquo; has been <strong>${statusLabel}</strong>.`),
      reasonLine ? emailMuted(escapeHtml(reasonLine)) : '',
      emailButton(requestsUrl, 'View your requests'),
    ].filter(Boolean).join(''),
    appUrl: APP_URL,
  })
}

function buildEstimateSentEmail(input) {
  const detailUrl = portalUrl(`/estimates/${input.estimateId}`)
  const subject = `Estimate ${input.estimateNumber} is ready for review`
  const text = [
    `Hello ${input.recipientName},`,
    '',
    `Estimate ${input.estimateNumber} is ready for your review in the customer portal.`,
    '',
    `View estimate: ${detailUrl}`,
  ].join('\n')
  return buildStyledEmail({
    subject,
    text,
    title: `Estimate ${input.estimateNumber}`,
    preheader: `Estimate ${input.estimateNumber} is ready for review`,
    bodyHtml: [
      emailParagraph(`Hello ${escapeHtml(input.recipientName)},`),
      emailParagraph(`Estimate <strong>${escapeHtml(input.estimateNumber)}</strong> is ready for your review in the customer portal.`),
      emailButton(detailUrl, 'View estimate in the portal'),
    ].join(''),
    appUrl: APP_URL,
  })
}

const templates = [
  {
    file: '01-signup-verification.html',
    name: 'Signup verification',
    ...buildSignupVerificationEmail({
      name: 'Alex Morgan',
      verifyUrl: `${APP_URL}/auth/verify-email?token=sample-token`,
      appUrl: APP_URL,
    }),
  },
  {
    file: '02-smtp-test.html',
    name: 'SMTP test',
    ...buildSmtpTestEmail({
      source: 'Super Admin control panel',
      actorName: 'Jordan Lee',
      sentAt: '2026-07-09T18:00:00.000Z',
      appUrl: APP_URL,
    }),
  },
  {
    file: '03-portal-credentials.html',
    name: 'Portal credentials',
    ...buildPortalCredentialEmail({
      name: 'Pat Rivera',
      username: 'pat.rivera',
      tempPassword: 'Kx9!mP2vQw',
      appUrl: APP_URL,
    }),
  },
  {
    file: '04-invoice-portal-notification.html',
    name: 'Invoice sent (portal link)',
    ...buildInvoiceSentEmail({
      recipientName: 'Pat Rivera',
      invoiceNumber: 'INV-000142',
      invoiceId: 'inv-sample-id',
      dueDate: '2026-08-01',
      total: '$1,248.50',
    }),
  },
  {
    file: '05-invoice-pdf-attached.html',
    name: 'Invoice sent (PDF attached)',
    ...buildInvoiceAttachedEmail({
      recipientName: 'Pat Rivera',
      invoiceNumber: 'INV-000142',
      dueDate: '2026-08-01',
      total: '$1,248.50',
      appUrl: APP_URL,
    }),
  },
  {
    file: '06-request-status-approved.html',
    name: 'Portal request approved',
    ...buildRequestStatusEmail({
      recipientName: 'Pat Rivera',
      requestKind: 'service',
      requestTitle: 'Oil change — Unit 12',
      status: 'approved',
      reviewReason: 'Scheduled for Monday morning.',
    }),
  },
  {
    file: '07-request-status-rejected.html',
    name: 'Portal request rejected',
    ...buildRequestStatusEmail({
      recipientName: 'Pat Rivera',
      requestKind: 'invoice_change',
      requestTitle: 'Credit for duplicate line item',
      status: 'rejected',
      reviewReason: 'Invoice was already corrected on INV-000138.',
    }),
  },
  {
    file: '08-estimate-sent.html',
    name: 'Estimate sent',
    ...buildEstimateSentEmail({
      recipientName: 'Pat Rivera',
      estimateNumber: 'EST-000019',
      estimateId: 'est-sample-id',
    }),
  },
  {
    file: '09-backup-success.html',
    name: 'Backup completed',
    ...buildBackupNotificationEmail({
      success: true,
      filename: 'dorinc-backup-20260709-0200.sql.zst.enc',
      trigger: 'scheduled',
      driveFileId: '1abcDriveFileIdSample',
      appUrl: APP_URL,
    }),
  },
  {
    file: '10-backup-failed.html',
    name: 'Backup failed',
    ...buildBackupNotificationEmail({
      success: false,
      filename: 'dorinc-backup-20260709-0200.sql.zst.enc',
      trigger: 'manual',
      error: 'pg_dump exited with code 1',
      appUrl: APP_URL,
    }),
  },
]

await mkdir(OUT_DIR, { recursive: true })

for (const tpl of templates) {
  const path = join(OUT_DIR, tpl.file)
  await writeFile(path, tpl.html, 'utf8')
  console.log(`Wrote ${tpl.file} — ${tpl.name}`)
}

console.log(`\nExported ${templates.length} templates to Agent-Files/email/`)
