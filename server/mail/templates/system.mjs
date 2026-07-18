/**
 * System + staff transactional email templates (shared by Nuxt API and workers).
 */
import {
  EMAIL_BRAND_NAME,
  buildStyledEmail,
  emailQuotedMessage,
  escapeHtml,
} from '../email-layout.mjs'

function brandNameFrom(opts) {
  return opts?.brand?.brandName || opts?.brandName || EMAIL_BRAND_NAME
}

function formatMoneyForDisplay(value) {
  if (value == null || String(value).trim() === '') return null
  const trimmed = String(value).trim()
  if (trimmed.startsWith('$')) return trimmed
  const match = /^(-?\d{1,10})(?:\.(\d{1,2}))?$/.exec(trimmed)
  if (!match) return trimmed
  const negative = match[1].startsWith('-')
  const whole = negative ? match[1].slice(1) : match[1]
  const frac = (match[2] ?? '0').padEnd(2, '0').slice(0, 2)
  return `${negative ? '-' : ''}$${whole}.${frac}`
}

function titleCaseStatus(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function senderFirstName(fullName) {
  const first = String(fullName || '').trim().split(/\s+/).filter(Boolean)[0]
  if (!first) return 'Staff'
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

export function buildSignupVerificationEmail({ name, verifyUrl, brandName, appUrl, brand }) {
  const resolvedBrand = brandName || brandNameFrom({ brand, brandName })
  const subject = 'Verify Your Email'
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
  const subject = 'Reset Your Password'
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
  const subject = 'SMTP Test Successful'
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
  const subject = 'Your Portal Access'
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
  const subject = success
    ? `Backup Completed — ${filename}`
    : `Backup Failed — ${filename}`
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
  const totalLine = formatMoneyForDisplay(total)
  const subject = `Invoice ${invoiceNumber} Is Ready`
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
  ipLocation,
  locationAccuracyM,
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
  const subject = 'New Sign-In Detected'
  const deviceLabel = device || userAgent || null
  const accuracyLabel = locationAccuracyM != null && Number.isFinite(locationAccuracyM)
    ? `~${Math.round(locationAccuracyM)} m`
    : null
  const text = [
    `Hi ${name},`,
    '',
    `Your staff account was used to sign in to ${resolvedBrand}.`,
    '',
    `When: ${when}`,
    email ? `Email: ${email}` : '',
    location ? `Device location: ${location}` : '',
    ipLocation ? `Network location: ${ipLocation}` : '',
    accuracyLabel ? `Location accuracy: ${accuracyLabel}` : '',
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
      location ? { label: 'Device location', value: location } : null,
      ipLocation ? { label: 'Network location', value: ipLocation } : null,
      accuracyLabel ? { label: 'Location accuracy', value: accuracyLabel } : null,
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

export function buildCustomerAutoResponderEmail({
  recipientName,
  subject,
  message,
  appUrl,
  brand,
}) {
  const resolvedBrand = brandNameFrom({ brand })
  const greeting = recipientName?.trim() ? `Hi ${recipientName.trim()},` : 'Hello,'
  const bodyParagraphs = String(message || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
  const bodyHtml = bodyParagraphs
    .map(p => `<p style="margin:0 0 14px;color:#334155;font-size:16px;line-height:27px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const text = [greeting, '', ...bodyParagraphs, '', resolvedBrand].join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Message received',
    headline: 'We got your email',
    lead: greeting,
    bodyHtml,
    note: {
      title: 'What happens next',
      body: `A member of the ${resolvedBrand} team will review your message and reply as soon as possible.`,
    },
    footerNote: null,
    footerLinks: false,
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
  const subject = `Deletion Request Pending — ${entityLabel}`
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
  const subject = `Deletion Request ${titleCaseStatus(statusLabel)} — ${entityLabel}`
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
  const subject = `New User Awaiting Approval — ${userName}`
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
  const subject = `Invoice Pending Approval — ${invoiceNumber}`
  const totalLine = formatMoneyForDisplay(total)
  const text = [
    `Hi ${approverName},`,
    '',
    `Invoice ${invoiceNumber} for ${customerName} is waiting for manager approval.`,
    totalLine ? `Total: ${totalLine}` : '',
    '',
    `Review: ${invoiceUrl}`,
  ].filter(Boolean).join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Invoice approval',
    headline: 'Invoice needs approval',
    lead: `Invoice ${invoiceNumber} for ${customerName} is waiting for manager approval.`,
    highlight: totalLine
      ? {
          label: 'Invoice total',
          value: totalLine,
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

function truncateEmailNote(text, max = 1200) {
  const trimmed = String(text ?? '').trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export function buildCustomerServiceRequestStaffEmail({
  recipientName,
  customerName,
  vehicleUnit,
  vehicleDetails,
  serviceCategory,
  urgency,
  message,
  detailUrl,
  appUrl,
  brand,
}) {
  const subject = `Customer Service Request — ${customerName}`
  const text = [
    `Hi ${recipientName},`,
    '',
    `${customerName} submitted a service request through the customer portal.`,
    '',
    `Vehicle: ${vehicleUnit}`,
    vehicleDetails ? `Details: ${vehicleDetails}` : '',
    `Category: ${serviceCategory}`,
    `Urgency: ${urgency}`,
    '',
    'Customer message:',
    message,
    '',
    `Open in DORINC: ${detailUrl}`,
  ].filter(Boolean).join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Portal request',
    headline: 'New customer service request',
    lead: `${customerName} submitted a service request. Check the portal for full details and next steps.`,
    details: [
      { label: 'Customer', value: customerName },
      { label: 'Vehicle', value: vehicleUnit },
      vehicleDetails ? { label: 'Vehicle details', value: vehicleDetails } : null,
      { label: 'Category', value: serviceCategory },
      { label: 'Urgency', value: urgency },
      { label: 'Notified', value: recipientName },
    ].filter(Boolean),
    note: { title: 'Customer message', body: truncateEmailNote(message) },
    primaryAction: { href: detailUrl, label: 'View in portal' },
    footerNote: 'You received this because a customer submitted a service request in the portal.',
    appUrl,
    brand,
  })
}

export function buildCustomerChangeRequestStaffEmail({
  recipientName,
  customerName,
  requestKindLabel,
  topic,
  message,
  invoiceNumber,
  vehicleLabel,
  detailUrl,
  appUrl,
  brand,
}) {
  const subject = `Customer Change Request — ${customerName}`
  const text = [
    `Hi ${recipientName},`,
    '',
    `${customerName} submitted a ${requestKindLabel.toLowerCase()} through the customer portal.`,
    '',
    `Topic: ${topic}`,
    invoiceNumber ? `Invoice: ${invoiceNumber}` : '',
    vehicleLabel ? `Vehicle: ${vehicleLabel}` : '',
    '',
    'Customer message:',
    message,
    '',
    `Review in DORINC: ${detailUrl}`,
  ].filter(Boolean).join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Portal request',
    headline: 'New customer change request',
    lead: `${customerName} submitted a ${requestKindLabel.toLowerCase()}. Review the request in the portal.`,
    details: [
      { label: 'Customer', value: customerName },
      { label: 'Request type', value: requestKindLabel },
      { label: 'Topic', value: topic },
      invoiceNumber ? { label: 'Invoice', value: invoiceNumber } : null,
      vehicleLabel ? { label: 'Vehicle', value: vehicleLabel } : null,
      { label: 'Notified', value: recipientName },
    ].filter(Boolean),
    note: { title: 'Customer message', body: truncateEmailNote(message) },
    primaryAction: { href: detailUrl, label: 'Review in portal' },
    footerNote: 'You received this because a customer submitted a change request in the portal.',
    appUrl,
    brand,
  })
}

export function buildCustomerEmailReceivedStaffEmail({
  recipientName,
  customerName,
  customerEmail,
  subject,
  messagePreview,
  messagesUrl,
  appUrl,
  brand,
}) {
  const headline = `${customerName} Sent A Message`
  const mailSubject = subject?.trim()
    ? `${headline} — ${subject.trim()}`
    : headline
  const loginUrl = `${String(appUrl ?? '').replace(/\/$/, '')}/login`
  const quotedMessage = messagePreview ? truncateEmailNote(messagePreview, 800) : ''
  const text = [
    `Hi ${recipientName},`,
    '',
    `${customerName} (${customerEmail}) sent a message to your company inbox.`,
    subject?.trim() ? `Subject: ${subject.trim()}` : '',
    '',
    quotedMessage ? `"${quotedMessage}"` : '',
    '',
    `Sign in to DORINC: ${loginUrl}`,
    `Open Messages to reply: ${messagesUrl}`,
  ].filter(Boolean).join('\n')

  return buildStyledEmail({
    subject: mailSubject,
    text,
    eyebrow: 'Customer email',
    headline,
    lead: `${customerName} emailed your company inbox. Sign in to DORINC, open Messages, and reply to the customer.`,
    details: [
      { label: 'Customer', value: customerName },
      { label: 'Email', value: customerEmail },
      subject?.trim() ? { label: 'Subject', value: subject.trim() } : null,
    ].filter(Boolean),
    bodyHtml: quotedMessage ? emailQuotedMessage(quotedMessage) : undefined,
    primaryAction: { href: messagesUrl, label: 'Sign in & reply' },
    footerNote: 'You received this because a customer email was synced into Messages. Sign in to reply.',
    appUrl,
    brand,
  })
}

export function buildChatMessageReceivedEmail({
  recipientName,
  senderName,
  channelLabel,
  messagePreview,
  messagesUrl,
  appUrl,
  brand,
  isTeamChat = false,
}) {
  const subject = isTeamChat
    ? `${senderFirstName(senderName)} Sent A Team Message`
    : `${senderName} — ${channelLabel}`
  const text = [
    `Hi ${recipientName},`,
    '',
    `${senderName} sent a message in ${channelLabel}:`,
    '',
    messagePreview,
    '',
    `Open Messages: ${messagesUrl}`,
  ].join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Team chat',
    headline: `${senderName} sent a message`,
    lead: `You have a new message in ${channelLabel}.`,
    details: [
      { label: 'From', value: senderName },
      { label: 'Channel', value: channelLabel },
    ],
    bodyHtml: messagePreview
      ? `<p style="margin:0;color:#111827;font-size:17px;line-height:28px;font-weight:700;font-style:italic;font-family:Arial,Helvetica,sans-serif;">&ldquo;${escapeHtml(String(messagePreview))}&rdquo;</p>`
      : undefined,
    primaryAction: { href: messagesUrl, label: 'Open Messages' },
    footerNote: 'You received this because chat email notifications are enabled on your account.',
    appUrl,
    brand,
  })
}

export function buildServiceLogSentToInvoiceStaffEmail({
  recipientName,
  senderName,
  serviceLogLabel,
  customerName,
  vehicleUnit,
  vehicleDetails,
  invoiceNumber,
  invoiceUrl,
  serviceLogUrl,
  appUrl,
  brand,
}) {
  const subject = invoiceNumber
    ? `Invoice needs to be completed — ${invoiceNumber} (${serviceLogLabel})`
    : `Invoice needs to be completed — ${serviceLogLabel}`
  const text = [
    `Hi ${recipientName},`,
    '',
    `A draft invoice was created from ${serviceLogLabel} and needs to be completed.`,
    senderName ? `Sent by: ${senderName}` : '',
    '',
    `Customer: ${customerName}`,
    `Vehicle: ${vehicleUnit}`,
    vehicleDetails ? `Vehicle details: ${vehicleDetails}` : '',
    invoiceNumber ? `Draft invoice: ${invoiceNumber}` : '',
    '',
    `Complete invoice: ${invoiceUrl}`,
    `Service log: ${serviceLogUrl}`,
  ].filter(Boolean).join('\n')

  return buildStyledEmail({
    subject,
    text,
    eyebrow: 'Draft invoice',
    headline: 'Invoice needs to be completed',
    lead: senderName
      ? `${senderName} sent ${serviceLogLabel} to invoice. Open the draft and finish billing when you are ready.`
      : `${serviceLogLabel} was sent to invoice. Open the draft and finish billing when you are ready.`,
    highlight: {
      label: 'Service log',
      value: serviceLogLabel,
      status: 'Needs completion',
      statusTone: 'warn',
    },
    details: [
      senderName ? { label: 'Sent by', value: senderName } : null,
      { label: 'Customer', value: customerName },
      { label: 'Vehicle', value: vehicleUnit },
      vehicleDetails ? { label: 'Vehicle details', value: vehicleDetails } : null,
      invoiceNumber ? { label: 'Draft invoice', value: invoiceNumber } : null,
      { label: 'Notified', value: recipientName },
    ].filter(Boolean),
    primaryAction: { href: invoiceUrl, label: 'Complete invoice' },
    secondaryAction: { href: serviceLogUrl, label: 'View service log' },
    footerNote: 'You received this because a service log was sent to invoice and needs billing completed.',
    appUrl,
    brand,
  })
}
