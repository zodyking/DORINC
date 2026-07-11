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
  buildDeletionRequestResultEmail,
  buildDeletionRequestSubmittedEmail,
  buildInvoiceAttachedEmail,
  buildInvoicePendingApprovalEmail,
  buildLoginNotificationEmail,
  buildPortalCredentialEmail,
  buildSignupVerificationEmail,
  buildSmtpTestEmail,
  buildUserSignupPendingEmail,
} from '../server/mail/templates/system.mjs'
import { buildStyledEmail } from '../server/mail/email-layout.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'Agent-Files', 'email')
const APP_URL = 'https://app.dorinc.example.com'

const brand = {
  brandName: 'Devon On Site Repairs',
  brandLegal: 'Devon On Site Repairs Inc.',
  brandTagline: 'Accounting workspace',
  logoUrl: `${APP_URL}/images/dorinc-icon-trans.png`,
  logoInitial: 'D',
  addressLines: ['123 Business Avenue', 'New York, NY 10001'],
  phone: '(555) 010-2000',
  email: 'accounting@dorinc.example.com',
  appUrl: APP_URL,
  settingsUrl: `${APP_URL}/admin?tab=notifications`,
  helpUrl: `${APP_URL}/help`,
  signInUrl: `${APP_URL}/auth/login`,
}

function portalUrl(path = '') {
  return `${APP_URL.replace(/\/$/, '')}/portal${path}`
}

function buildInvoiceSentEmail(input) {
  const detailUrl = portalUrl(`/invoices/${input.invoiceId}`)
  return buildStyledEmail({
    subject: `Invoice ${input.invoiceNumber} is ready`,
    text: `Invoice ${input.invoiceNumber} is ready in your portal: ${detailUrl}`,
    eyebrow: 'Invoice',
    headline: `Invoice ${input.invoiceNumber}`,
    lead: `Invoice ${input.invoiceNumber} has been sent and is available in your customer portal.`,
    highlight: input.total
      ? { label: 'Invoice total', value: input.total, status: 'Ready', statusTone: 'ok' }
      : undefined,
    details: [
      { label: 'Customer', value: input.recipientName },
      { label: 'Invoice', value: input.invoiceNumber },
      input.dueDate ? { label: 'Due date', value: input.dueDate } : null,
    ].filter(Boolean),
    primaryAction: { href: detailUrl, label: 'View invoice in the portal' },
    appUrl: APP_URL,
    brand,
  })
}

function buildRequestStatusEmail(input) {
  const requestsUrl = portalUrl('/requests')
  const statusLabel = input.status === 'approved' ? 'approved' : 'rejected'
  return buildStyledEmail({
    subject: `Service request ${statusLabel}`,
    text: `Your request was ${statusLabel}`,
    eyebrow: 'Portal request',
    headline: `Request ${statusLabel}`,
    lead: `Your service request "${input.requestTitle}" has been ${statusLabel}.`,
    highlight: {
      label: 'Decision',
      value: input.status === 'approved' ? 'Approved' : 'Rejected',
      status: input.status === 'approved' ? 'Completed' : 'Closed',
      statusTone: input.status === 'approved' ? 'ok' : 'error',
    },
    details: [
      { label: 'Request', value: input.requestTitle },
      { label: 'Customer', value: input.recipientName },
    ],
    primaryAction: { href: requestsUrl, label: 'View your requests' },
    appUrl: APP_URL,
    brand,
  })
}

function buildEstimateSentEmail(input) {
  const detailUrl = portalUrl(`/estimates/${input.estimateId}`)
  return buildStyledEmail({
    subject: `Estimate ${input.estimateNumber} is ready for review`,
    text: `Estimate ${input.estimateNumber} is ready: ${detailUrl}`,
    eyebrow: 'Estimate',
    headline: `Estimate ${input.estimateNumber}`,
    lead: `Estimate ${input.estimateNumber} is ready for your review in the customer portal.`,
    details: [
      { label: 'Estimate', value: input.estimateNumber },
      { label: 'Customer', value: input.recipientName },
    ],
    primaryAction: { href: detailUrl, label: 'View estimate in the portal' },
    appUrl: APP_URL,
    brand,
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
      brand,
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
      brand,
    }),
  },
  {
    file: '03-portal-credentials.html',
    name: 'Portal credentials',
    ...buildPortalCredentialEmail({
      name: 'Pat Rivera',
      username: 'northstar',
      tempPassword: 'TempPass1!',
      appUrl: APP_URL,
      brand,
    }),
  },
  {
    file: '04-backup-success.html',
    name: 'Backup success',
    ...buildBackupNotificationEmail({
      success: true,
      filename: 'dorinc-2026-07-09.enc',
      trigger: 'scheduled',
      driveFileId: 'drive-file-123',
      appUrl: APP_URL,
      brand,
    }),
  },
  {
    file: '05-backup-failure.html',
    name: 'Backup failure',
    ...buildBackupNotificationEmail({
      success: false,
      filename: 'dorinc-2026-07-09.enc',
      trigger: 'manual',
      error: 'pg_dump exited with code 1',
      appUrl: APP_URL,
      brand,
    }),
  },
  {
    file: '06-invoice-attached.html',
    name: 'Invoice attached',
    ...buildInvoiceAttachedEmail({
      recipientName: 'Pat Rivera',
      invoiceNumber: 'INV-000184',
      dueDate: 'August 1, 2026',
      total: '$4,280.00',
      appUrl: APP_URL,
      brand,
    }),
  },
  {
    file: '07-login-notification.html',
    name: 'Login notification',
    ...buildLoginNotificationEmail({
      name: 'Alex Morgan',
      portal: 'staff',
      signedInAt: '2026-07-11T20:00:00.000Z',
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0',
      appUrl: APP_URL,
      brand,
    }),
  },
  {
    file: '08-invoice-sent-portal.html',
    name: 'Invoice sent (portal)',
    ...buildInvoiceSentEmail({
      recipientName: 'Pat Rivera',
      invoiceNumber: 'INV-000184',
      invoiceId: 'inv-sample',
      dueDate: 'August 1, 2026',
      total: '$4,280.00',
    }),
  },
  {
    file: '09-request-status.html',
    name: 'Portal request status',
    ...buildRequestStatusEmail({
      recipientName: 'Pat Rivera',
      requestTitle: 'Brake inspection',
      status: 'approved',
    }),
  },
  {
    file: '10-estimate-sent.html',
    name: 'Estimate sent',
    ...buildEstimateSentEmail({
      recipientName: 'Pat Rivera',
      estimateNumber: 'EST-000012',
      estimateId: 'est-sample',
    }),
  },
  {
    file: '11-deletion-request-submitted.html',
    name: 'Deletion request submitted',
    ...buildDeletionRequestSubmittedEmail({
      reviewerName: 'Jordan Lee',
      submitterName: 'Alex Morgan',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-000184',
      reason: 'Created in error / duplicate',
      reviewUrl: `${APP_URL}/deletion-requests`,
      appUrl: APP_URL,
      brand,
    }),
  },
  {
    file: '12-deletion-request-result.html',
    name: 'Deletion request result',
    ...buildDeletionRequestResultEmail({
      requestorName: 'Alex Morgan',
      status: 'rejected',
      entityTypeLabel: 'Invoice',
      entityLabel: 'INV-000184',
      reviewReason: 'Invoice is still needed for monthly reporting.',
      reviewedByName: 'Jordan Lee',
      appUrl: APP_URL,
      brand,
    }),
  },
  {
    file: '13-user-signup-pending.html',
    name: 'User signup pending approval',
    ...buildUserSignupPendingEmail({
      adminName: 'Jordan Lee',
      userName: 'Sam Carter',
      userEmail: 'sam.carter@example.com',
      usersUrl: `${APP_URL}/users`,
      appUrl: APP_URL,
      brand,
    }),
  },
  {
    file: '14-invoice-pending-approval.html',
    name: 'Invoice pending approval',
    ...buildInvoicePendingApprovalEmail({
      approverName: 'Jordan Lee',
      invoiceNumber: 'INV-000099',
      customerName: 'Northstar Logistics',
      total: '$6,400.00',
      invoiceUrl: `${APP_URL}/invoices/sample`,
      appUrl: APP_URL,
      brand,
    }),
  },
]

await mkdir(OUT_DIR, { recursive: true })
for (const tpl of templates) {
  await writeFile(join(OUT_DIR, tpl.file), tpl.html, 'utf8')
  console.log(`Wrote ${tpl.file} (${tpl.name})`)
}
console.log(`Exported ${templates.length} templates to ${OUT_DIR}`)
