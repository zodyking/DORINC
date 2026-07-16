/**
 * System + staff transactional email templates (shared by Nuxt API and workers).
 */
import {
  EMAIL_BRAND_NAME,
  buildStyledEmail,
} from '../email-layout.mjs'

function brandNameFrom(opts) {
  return opts?.brand?.brandName || opts?.brandName || EMAIL_BRAND_NAME
}

export function buildSignupVerificationEmail({ name, verifyUrl, brandName, appUrl, brand }) {
  const resolvedBrand = brandName || brandNameFrom({ brand, brandName })
  const subject = `Verify your ${resolvedBrand} account`
  const text = [
    `Hi ${name},`,
    '',
    `Confirm your email to continue your ${resolvedBrand} signup:`,
    verifyUrl,
    '',
    'The link expires in 24 hours. After verification an administrator must approve your account.',
  ].join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Account verification',
    headline: 'Verify your email',
    lead: `Confirm your email to continue your ${resolvedBrand} account request.`,
    details: [
      { label: 'Recipient', value: name },
      { label: 'Expires', value: '24 hours' },
    ],
    note: {
      title: 'What happens next',
      body: 'After verification, an administrator must approve your account before you can sign in.',
    },
    primaryAction: { href: verifyUrl, label: 'Verify email address' },
    appUrl,
    brand,
  })
}

export function buildPasswordResetEmail({ name, resetUrl, brandName, appUrl, brand }) {
  const resolvedBrand = brandName || brandNameFrom({ brand, brandName })
  const subject = `Reset your ${resolvedBrand} password`
  const text = [
    `Hi ${name},`,
    '',
    `We received a request to reset your ${resolvedBrand} staff password.`,
    resetUrl,
    '',
    'The link expires in 1 hour. If you did not request this, you can ignore this email.',
  ].join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Password reset',
    headline: 'Reset your password',
    lead: `Use the button below to choose a new password for your ${resolvedBrand} staff account.`,
    details: [
      { label: 'Recipient', value: name },
      { label: 'Expires', value: '1 hour' },
    ],
    note: {
      title: 'Did not request this?',
      body: 'You can safely ignore this email — your password will not change unless you use the link above.',
    },
    primaryAction: { href: resetUrl, label: 'Reset password' },
    appUrl,
    brand,
  })
}

export function buildSmtpTestEmail({
  brandName,
  source,
  actorName,
  sentAt,
  appUrl,
  brand,
}) {
  const resolvedBrand = brandName || brandNameFrom({ brand, brandName })
  const subject = `${resolvedBrand} SMTP test`
  const text = [
    `This is a test message from the ${resolvedBrand} ${source}.`,
    '',
    actorName ? `Sent by ${actorName} at ${sentAt}.` : '',
    'If you received this, SMTP is configured correctly.',
  ].filter(Boolean).join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'System test',
    headline: 'SMTP test successful',
    lead: `This is a test message from the ${resolvedBrand} ${source}.`,
    details: [
      actorName ? { label: 'Sent by', value: actorName } : null,
      sentAt ? { label: 'Sent at', value: sentAt } : null,
      { label: 'Status', value: 'Delivered' },
    ].filter(Boolean),
    note: {
      title: 'Result',
      body: 'If you received this email, outbound SMTP is working correctly.',
    },
    appUrl,
    brand,
  })
}

export function buildPortalCredentialEmail({ name, username, tempPassword, appUrl, brand }) {
  const resolvedBrand = brandNameFrom({ brand })
  const loginUrl = `${String(appUrl || brand?.appUrl || '').replace(/\/$/, '')}/auth/login`
  const subject = `Your ${resolvedBrand} Customer Portal access`
  const text = [
    `Hello ${name},`,
    '',
    `A staff member has sent you access to the ${resolvedBrand} Customer Portal.`,
    '',
    `Sign in: ${loginUrl}`,
    `Username: ${username}`,
    `Temporary password: ${tempPassword}`,
    '',
    'This temporary password expires in 7 days. You will be required to choose a new password on first login.',
  ].join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Portal access',
    headline: 'Customer Portal access',
    lead: `A staff member has sent you access to the ${resolvedBrand} Customer Portal. Use the button below to sign in.`,
    details: [
      { label: 'Username', value: username },
      { label: 'Temporary password', value: tempPassword },
      { label: 'Expires', value: '7 days' },
      { label: 'Recipient', value: name },
    ],
    note: {
      title: 'Security note',
      body: 'You will choose a new password on first login. If you did not expect this email, contact the shop that issued it.',
    },
    primaryAction: { href: loginUrl, label: 'Sign in to the portal' },
    appUrl,
    brand,
  })
}

export function buildBackupNotificationEmail({
  success,
  filename,
  trigger,
  driveFileId,
  error,
  appUrl,
  brand,
}) {
  const resolvedBrand = brandNameFrom({ brand })
  const subject = success
    ? `${resolvedBrand} backup completed — ${filename}`
    : `${resolvedBrand} backup failed — ${filename}`
  const when = new Date().toISOString()
  const lines = [
    success ? 'An encrypted database backup completed successfully.' : 'An encrypted database backup failed.',
    '',
    `File: ${filename}`,
    `Trigger: ${trigger}`,
  ]
  if (driveFileId) lines.push(`Google Drive file: ${driveFileId}`)
  if (error) lines.push(`Error: ${error}`)
  lines.push('', `Time: ${when}`)

  return buildStyledEmail({
    subject,
    text: lines.join('\n'),
    eyebrow: 'Backup',
    headline: success ? 'Backup completed' : 'Backup failed',
    lead: success
      ? 'An encrypted database backup completed successfully.'
      : 'An encrypted database backup failed. Review the control panel for details.',
    highlight: {
      label: 'Status',
      value: success ? 'Success' : 'Failed',
      status: success ? 'Completed' : 'Error',
      statusTone: success ? 'ok' : 'error',
    },
    details: [
      { label: 'File', value: filename },
      { label: 'Trigger', value: trigger },
      driveFileId ? { label: 'Google Drive', value: driveFileId } : null,
      { label: 'Time', value: when },
    ].filter(Boolean),
    note: error
      ? { title: 'Error details', body: error }
      : undefined,
    primaryAction: appUrl || brand?.appUrl
      ? { href: `${String(appUrl || brand.appUrl).replace(/\/$/, '')}/admin?tab=backup`, label: 'Open backup settings' }
      : undefined,
    appUrl,
    brand,
  })
}

export function buildInvoiceAttachedEmail({
  recipientName,
  invoiceNumber,
  dueDate,
  total,
  appUrl,
  brand,
}) {
  const dueLine = dueDate || null
  const totalLine = total || null
  const subject = `Invoice ${invoiceNumber} is ready`
  const text = [
    `Hello ${recipientName},`,
    '',
    `Invoice ${invoiceNumber} is attached to this email.`,
    dueLine ? `Due date: ${dueLine}` : '',
    totalLine ? `Total: ${totalLine}` : '',
  ].filter(Boolean).join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Invoice',
    headline: `Invoice ${invoiceNumber}`,
    lead: `Hello ${recipientName}, invoice ${invoiceNumber} is attached to this email as a PDF.`,
    highlight: totalLine
      ? {
          label: 'Invoice total',
          value: totalLine,
          status: 'Ready',
          statusTone: 'ok',
        }
      : undefined,
    details: [
      { label: 'Invoice', value: invoiceNumber },
      dueLine ? { label: 'Due date', value: dueLine } : null,
      { label: 'Recipient', value: recipientName },
      { label: 'Attachment', value: 'PDF included' },
    ].filter(Boolean),
    note: {
      title: 'Need help?',
      body: 'If you have questions, reply to this email or submit a request through your customer portal.',
    },
    appUrl,
    brand,
  })
}

export function buildLoginNotificationEmail({
  name,
  email,
  portal = 'staff',
  signedInAt,
  ipAddress,
  location,
  device,
  userAgent,
  appUrl,
  brandName,
  brand,
}) {
  const resolvedBrand = brandName || brandNameFrom({ brand, brandName })
  const when = signedInAt
    ? new Date(signedInAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const subject = `New sign-in to ${resolvedBrand}`
  const deviceLabel = device || userAgent || null
  const text = [
    `Hi ${name},`,
    '',
    `Your staff account was used to sign in to ${resolvedBrand}.`,
    '',
    `When: ${when}`,
    email ? `Email: ${email}` : '',
    location ? `Location: ${location}` : '',
    ipAddress ? `IP address: ${ipAddress}` : '',
    deviceLabel ? `Device: ${deviceLabel}` : '',
    '',
    'If this was not you, contact your administrator immediately and change your password.',
  ].filter(Boolean).join('\n')

  const base = String(appUrl || brand?.appUrl || '').replace(/\/$/, '')
  const loginUrl = `${base}${portal === 'customer' ? '/auth/login?portal=customer' : '/auth/login'}`

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Sign-in alert',
    headline: 'New sign-in',
    lead: `Your staff account was used to sign in to ${resolvedBrand}.`,
    details: [
      { label: 'When', value: when },
      { label: 'User', value: name },
      email ? { label: 'Email', value: email } : null,
      location ? { label: 'Location', value: location } : null,
      ipAddress ? { label: 'IP address', value: ipAddress } : null,
      deviceLabel ? { label: 'Device', value: deviceLabel } : null,
    ].filter(Boolean),
    note: {
      title: 'Was this you?',
      body: 'If this was not you, contact your administrator immediately and change your password.',
    },
    primaryAction: {
      href: loginUrl,
      label: portal === 'customer' ? 'Open customer portal' : `Open ${resolvedBrand}`,
    },
    appUrl,
    brand,
  })
}

export function buildDeletionRequestSubmittedEmail({
  reviewerName,
  submitterName,
  entityTypeLabel,
  entityLabel,
  reason,
  reviewUrl,
  appUrl,
  brand,
}) {
  const subject = `Deletion request pending — ${entityLabel}`
  const text = [
    `Hi ${reviewerName},`,
    '',
    `${submitterName} requested deletion of ${entityTypeLabel} "${entityLabel}".`,
    '',
    `Reason: ${reason}`,
    '',
    `Review: ${reviewUrl}`,
  ].join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Deletion request',
    headline: 'New deletion request',
    lead: `${submitterName} requested deletion of a ${entityTypeLabel.toLowerCase()}. Review the details and approve or deny the request.`,
    details: [
      { label: 'Record', value: entityLabel },
      { label: 'Type', value: entityTypeLabel },
      { label: 'Requested by', value: submitterName },
      { label: 'Reviewer', value: reviewerName },
    ],
    note: { title: 'Request reason', body: reason },
    primaryAction: { href: reviewUrl, label: 'Review request' },
    appUrl,
    brand,
  })
}

export function buildDeletionRequestResultEmail({
  requestorName,
  status,
  entityTypeLabel,
  entityLabel,
  reviewReason,
  reviewedByName,
  appUrl,
  brand,
}) {
  const approved = status === 'approved'
  const statusLabel = approved ? 'approved' : 'denied'
  const subject = `Deletion request ${statusLabel} — ${entityLabel}`
  const text = [
    `Hi ${requestorName},`,
    '',
    `Your deletion request for ${entityTypeLabel} "${entityLabel}" was ${statusLabel}.`,
    reviewedByName ? `Reviewed by: ${reviewedByName}` : '',
    reviewReason ? `Note: ${reviewReason}` : '',
  ].filter(Boolean).join('\n')

  const base = String(appUrl || brand?.appUrl || '').replace(/\/$/, '')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Deletion request',
    headline: approved ? 'Deletion approved' : 'Deletion denied',
    lead: `Your deletion request for ${entityTypeLabel.toLowerCase()} "${entityLabel}" was ${statusLabel}.`,
    highlight: {
      label: 'Decision',
      value: approved ? 'Approved' : 'Denied',
      status: approved ? 'Completed' : 'Rejected',
      statusTone: approved ? 'ok' : 'error',
    },
    details: [
      { label: 'Record', value: entityLabel },
      { label: 'Type', value: entityTypeLabel },
      reviewedByName ? { label: 'Reviewed by', value: reviewedByName } : null,
      { label: 'Requestor', value: requestorName },
    ].filter(Boolean),
    note: reviewReason
      ? { title: 'Reviewer note', body: reviewReason }
      : undefined,
    primaryAction: base
      ? { href: `${base}/deletion-requests`, label: 'View deletion requests' }
      : undefined,
    appUrl,
    brand,
  })
}

export function buildUserSignupPendingEmail({
  adminName,
  userName,
  userEmail,
  usersUrl,
  appUrl,
  brand,
}) {
  const subject = `New user awaiting approval — ${userName}`
  const text = [
    `Hi ${adminName},`,
    '',
    `${userName} (${userEmail}) verified their email and is awaiting account approval.`,
    '',
    `Review users: ${usersUrl}`,
  ].join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'User approval',
    headline: 'New user awaiting approval',
    lead: 'A staff signup finished email verification and needs an administrator to approve the account.',
    details: [
      { label: 'Name', value: userName },
      { label: 'Email', value: userEmail },
      { label: 'Status', value: 'Pending approval' },
      { label: 'Notified', value: adminName },
    ],
    primaryAction: { href: usersUrl, label: 'Review users' },
    appUrl,
    brand,
  })
}

export function buildInvoicePendingApprovalEmail({
  approverName,
  invoiceNumber,
  customerName,
  total,
  invoiceUrl,
  appUrl,
  brand,
}) {
  const subject = `Invoice pending approval — ${invoiceNumber}`
  const text = [
    `Hi ${approverName},`,
    '',
    `Invoice ${invoiceNumber} for ${customerName} is waiting for manager approval.`,
    total ? `Total: ${total}` : '',
    '',
    `Review: ${invoiceUrl}`,
  ].filter(Boolean).join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Invoice approval',
    headline: 'Invoice needs approval',
    lead: `Invoice ${invoiceNumber} for ${customerName} is waiting for manager approval.`,
    highlight: total
      ? {
          label: 'Invoice total',
          value: total,
          status: 'Pending',
          statusTone: 'warn',
        }
      : undefined,
    details: [
      { label: 'Invoice', value: invoiceNumber },
      { label: 'Customer', value: customerName },
      { label: 'Approver', value: approverName },
    ],
    primaryAction: { href: invoiceUrl, label: 'Review invoice' },
    appUrl,
    brand,
  })
}
