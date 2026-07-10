/**
 * System + staff transactional email templates (shared by Nuxt API and workers).
 */
import {
  EMAIL_BRAND_NAME,
  buildStyledEmail,
  emailBadge,
  emailButton,
  emailMuted,
  emailPanel,
  emailParagraph,
  escapeHtml,
} from '../email-layout.mjs'

export function buildSignupVerificationEmail({ name, verifyUrl, brandName = EMAIL_BRAND_NAME, appUrl }) {
  const subject = `Verify your ${brandName} account`
  const text = [
    `Hi ${name},`,
    '',
    `Confirm your email to continue your ${brandName} signup:`,
    verifyUrl,
    '',
    'The link expires in 24 hours. After verification an administrator must approve your account.',
  ].join('\n')

  return buildStyledEmail({
    subject,
    text,
    title: 'Verify your email',
    preheader: `Confirm your ${brandName} signup`,
    bodyHtml: [
      emailParagraph(`Hi ${escapeHtml(name)},`),
      emailParagraph(`Confirm your email to continue your <strong>${escapeHtml(brandName)}</strong> account request.`),
      emailButton(verifyUrl, 'Verify email address'),
      emailMuted('This link expires in 24 hours. After verification, an administrator must approve your account before you can sign in.'),
    ].join(''),
    appUrl,
  })
}

export function buildSmtpTestEmail({
  brandName = EMAIL_BRAND_NAME,
  source,
  actorName,
  sentAt,
  appUrl,
}) {
  const subject = `${brandName} SMTP test`
  const text = [
    `This is a test message from the ${brandName} ${source}.`,
    '',
    actorName ? `Sent by ${actorName} at ${sentAt}.` : '',
    'If you received this, SMTP is configured correctly.',
  ].filter(Boolean).join('\n')

  return buildStyledEmail({
    subject,
    text,
    title: 'SMTP test successful',
    preheader: `${brandName} SMTP is configured correctly`,
    bodyHtml: [
      emailParagraph(`This is a test message from the <strong>${escapeHtml(brandName)}</strong> ${escapeHtml(source)}.`),
      actorName ? emailMuted(`Sent by ${escapeHtml(actorName)} at ${escapeHtml(sentAt)}.`) : '',
      emailMuted('If you received this email, outbound SMTP is working correctly.'),
    ].filter(Boolean).join(''),
    appUrl,
  })
}

export function buildPortalCredentialEmail({ name, username, tempPassword, appUrl }) {
  const loginUrl = `${String(appUrl).replace(/\/$/, '')}/auth/login`
  const subject = 'Your DORINC Customer Portal access'
  const text = [
    `Hello ${name},`,
    '',
    'A staff member has sent you access to the DORINC Customer Portal.',
    '',
    `Sign in: ${loginUrl}`,
    `Username: ${username}`,
    `Temporary password: ${tempPassword}`,
    '',
    'This temporary password expires in 7 days. You will be required to choose a new password on first login.',
    '',
    'If you did not expect this email, contact Devon On Site Repairs Inc.',
  ].join('\n')

  return buildStyledEmail({
    subject,
    text,
    title: 'Customer Portal access',
    preheader: 'Your temporary portal password is ready',
    bodyHtml: [
      emailParagraph(`Hello ${escapeHtml(name)},`),
      emailParagraph('A staff member has sent you access to the <strong>DORINC Customer Portal</strong>. Use the button below to sign in.'),
      emailButton(loginUrl, 'Sign in to the portal'),
      emailPanel(
        'Sign-in details',
        `<strong>Username:</strong> ${escapeHtml(username)}<br><strong>Temporary password:</strong> ${escapeHtml(tempPassword)}`,
      ),
      emailMuted('This temporary password expires in 7 days. You will choose a new password on first login.'),
      emailMuted('If you did not expect this email, contact Devon On Site Repairs Inc.'),
    ].join(''),
    appUrl,
  })
}

export function buildBackupNotificationEmail({
  success,
  filename,
  trigger,
  driveFileId,
  error,
  appUrl,
}) {
  const subject = success
    ? `DORINC backup completed — ${filename}`
    : `DORINC backup failed — ${filename}`
  const lines = [
    success ? 'An encrypted database backup completed successfully.' : 'An encrypted database backup failed.',
    '',
    `File: ${filename}`,
    `Trigger: ${trigger}`,
  ]
  if (driveFileId) lines.push(`Google Drive file: ${driveFileId}`)
  if (error) lines.push(`Error: ${error}`)
  lines.push('', `Time: ${new Date().toISOString()}`)

  const title = success ? 'Backup completed' : 'Backup failed'
  const bodyHtml = [
    emailParagraph(success
      ? 'An encrypted database backup completed successfully.'
      : 'An encrypted database backup <strong>failed</strong>. Review the control panel for details.'),
    emailPanel('Backup details', [
      `<strong>File:</strong> ${escapeHtml(filename)}`,
      `<strong>Trigger:</strong> ${escapeHtml(trigger)}`,
      driveFileId ? `<strong>Google Drive:</strong> ${escapeHtml(driveFileId)}` : '',
      error ? `<strong>Error:</strong> ${escapeHtml(error)}` : '',
      `<strong>Time:</strong> ${escapeHtml(new Date().toISOString())}`,
    ].filter(Boolean).join('<br>')),
  ].join('')

  return buildStyledEmail({
    subject,
    text: lines.join('\n'),
    title,
    preheader: subject,
    bodyHtml,
    appUrl,
  })
}

export function buildInvoiceAttachedEmail({
  recipientName,
  invoiceNumber,
  dueDate,
  total,
  appUrl,
}) {
  const dueLine = dueDate ? `Due date: ${dueDate}` : null
  const totalLine = total ? `Total: ${total}` : null
  const subject = `Invoice ${invoiceNumber} is ready`
  const text = [
    `Hello ${recipientName},`,
    '',
    `Invoice ${invoiceNumber} is attached to this email.`,
    dueLine,
    totalLine,
  ].filter(Boolean).join('\n')

  const metaBits = [dueLine, totalLine].filter(Boolean).map(line => emailMuted(escapeHtml(line))).join('')

  return buildStyledEmail({
    subject,
    text,
    title: `Invoice ${invoiceNumber}`,
    preheader: `Invoice ${invoiceNumber} is attached`,
    bodyHtml: [
      emailParagraph(`Hello ${escapeHtml(recipientName)},`),
      emailParagraph(`Invoice <strong>${escapeHtml(invoiceNumber)}</strong> is attached to this email as a PDF.`),
      metaBits,
      emailMuted('If you have questions, reply to this email or submit a request through your customer portal.'),
    ].join(''),
    appUrl,
  })
}

export function buildLoginNotificationEmail({
  name,
  portal = 'staff',
  signedInAt,
  ipAddress,
  userAgent,
  appUrl,
  brandName = EMAIL_BRAND_NAME,
}) {
  const portalLabel = portal === 'customer' ? 'Customer portal' : 'Staff account'
  const when = signedInAt
    ? new Date(signedInAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const subject = `New sign-in to ${brandName}`
  const text = [
    `Hi ${name},`,
    '',
    `Your ${portalLabel.toLowerCase()} was used to sign in to ${brandName}.`,
    '',
    `When: ${when}`,
    ipAddress ? `IP address: ${ipAddress}` : '',
    userAgent ? `Device: ${userAgent}` : '',
    '',
    'If this was not you, contact your administrator immediately and change your password.',
  ].filter(Boolean).join('\n')

  const loginUrl = `${String(appUrl).replace(/\/$/, '')}${portal === 'customer' ? '/auth/login?portal=customer' : '/auth/login'}`

  const details = [
    `<strong>When:</strong> ${escapeHtml(when)}`,
    `<strong>Account:</strong> ${escapeHtml(portalLabel)}`,
    ipAddress ? `<strong>IP address:</strong> ${escapeHtml(ipAddress)}` : '',
    userAgent ? `<strong>Device:</strong> ${escapeHtml(userAgent)}` : '',
  ].filter(Boolean).join('<br>')

  return buildStyledEmail({
    subject,
    text,
    title: 'New sign-in',
    preheader: `Sign-in to your ${brandName} ${portalLabel.toLowerCase()}`,
    bodyHtml: [
      emailBadge('Sign-in alert', 'warn'),
      emailParagraph(`Hi ${escapeHtml(name)},`),
      emailParagraph(`Your <strong>${escapeHtml(portalLabel.toLowerCase())}</strong> was used to sign in to <strong>${escapeHtml(brandName)}</strong>.`),
      emailPanel('Sign-in details', details),
      emailButton(loginUrl, portal === 'customer' ? 'Open customer portal' : 'Open DORINC'),
      emailMuted('If this was not you, contact your administrator immediately and change your password.'),
    ].join(''),
    appUrl,
  })
}
