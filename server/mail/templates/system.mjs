/**
 * System + staff transactional email templates (shared by Nuxt API and workers).
 */
import {
  EMAIL_BRAND_NAME,
  EMAIL_TOKENS,
  buildStyledEmail,
  emailQuotedMessage,
  escapeHtml,
} from '../email-layout.mjs'
import {
  applyEmailTemplateOverride,
  finalizeMailWithTemplateOverride,
} from '../email-template-override.mjs'

function styledEmail(opts) {
  const { templateOverride = null, templateVars = {}, ...rest } = opts || {}
  const mail = buildStyledEmail(applyEmailTemplateOverride(rest, templateOverride, templateVars))
  return finalizeMailWithTemplateOverride(mail, templateOverride, templateVars)
}

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

export function buildSignupVerificationEmail({ name, verifyUrl, brandName, appUrl, brand,
  templateOverride,
}) {
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
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
    templateOverride,
    templateVars: { name, brandName: resolvedBrand, verifyUrl },
})
}

export function buildPasswordResetEmail({ name, resetUrl, brandName, appUrl, brand,
  templateOverride,
}) {
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
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
    templateOverride,
    templateVars: { name, brandName: resolvedBrand, resetUrl },
})
}

export function buildOutsideGeofenceVerificationEmail({
  name,
  code,
  locationLabel,
  ipAddress,
  brandName,
  appUrl,
  brand,
  templateOverride,
}) {
  const resolvedBrand = brandName || brandNameFrom({ brand, brandName })
  const subject = 'Verify Suspicious Location Access'
  const text = [
    `Hi ${name},`,
    '',
    `Someone is trying to access ${resolvedBrand} from a suspicious location outside the allowed area.`,
    locationLabel ? `Location: ${locationLabel}` : '',
    ipAddress ? `IP address: ${ipAddress}` : '',
    '',
    `Your verification code: ${code}`,
    '',
    'This code expires in 15 minutes. If this was not you, contact your administrator immediately and change your password.',
  ].filter(Boolean).join('\n')

  const base = String(appUrl || brand?.appUrl || '').replace(/\/$/, '')
  const verifyUrl = base ? `${base}/auth/verify-location` : undefined

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'Suspicious location detected',
    lead: `You're accessing ${resolvedBrand} from a suspicious location. Enter this verification code to confirm your identity.`,
    highlight: {
      label: 'Verification Code',
      value: String(code),
      status: 'Expires in 15 minutes',
      statusTone: 'warn',
    },
    details: [
      { label: 'Recipient', value: name },
      locationLabel ? { label: 'Location', value: locationLabel } : null,
      ipAddress ? { label: 'IP Address', value: ipAddress } : null,
      { label: 'Expires', value: '15 minutes' },
    ].filter(Boolean),
    note: {
      title: 'Was this not you?',
      body: 'If you did not attempt to sign in, contact your administrator immediately and change your password.',
    },
    primaryAction: verifyUrl
      ? { href: verifyUrl, label: 'Enter verification code' }
      : undefined,
    appUrl,
    brand,
    templateOverride,
    templateVars: { name, brandName: resolvedBrand, code, locationLabel, ipAddress },
})
}

export function buildSmtpTestEmail({
  brandName,
  source,
  actorName,
  sentAt,
  appUrl,
  brand,
  templateOverride,
}) {
  const resolvedBrand = brandName || brandNameFrom({ brand, brandName })
  const subject = 'SMTP Test Successful'
  const text = [
    `This is a test message from the ${resolvedBrand} ${source}.`,
    '',
    actorName ? `Sent by ${actorName} at ${sentAt}.` : '',
    'If you received this, SMTP is configured correctly.',
  ].filter(Boolean).join('\n')

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'SMTP test successful',
    lead: `This is a test message from the ${resolvedBrand} ${source}.`,
    details: [
      actorName ? { label: 'Sent By', value: actorName } : null,
      sentAt ? { label: 'Sent At', value: sentAt } : null,
      { label: 'Status', value: 'Delivered' },
    ].filter(Boolean),
    note: {
      title: 'Result',
      body: 'If you received this email, outbound SMTP is working correctly.',
    },
    appUrl,
    brand,
    templateOverride,
    templateVars: { brandName: resolvedBrand, source, actorName, sentAt },
})
}

export function buildPortalCredentialEmail({ name, username, tempPassword, appUrl, brand,
  templateOverride,
}) {
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'Customer Portal access',
    lead: `A staff member has sent you access to the ${resolvedBrand} Customer Portal. Use the button below to sign in.`,
    details: [
      { label: 'Username', value: username },
      { label: 'Temporary Password', value: tempPassword },
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
    templateOverride,
    templateVars: { name, brandName: resolvedBrand, username, tempPassword },
})
}

export function buildStaffInviteEmail({ name, email, tempPassword, appUrl, brand,
  templateOverride,
}) {
  const resolvedBrand = brandNameFrom({ brand })
  const loginUrl = `${String(appUrl || brand?.appUrl || '').replace(/\/$/, '')}/auth/login?card=staff`
  const subject = `You're invited to ${resolvedBrand}`
  const text = [
    `Hello ${name},`,
    '',
    `You've been invited to join the ${resolvedBrand} staff workspace.`,
    '',
    `Sign in: ${loginUrl}`,
    `Email: ${email}`,
    `Temporary password: ${tempPassword}`,
    '',
    'Your email is already verified. Choose a new password when you sign in for the first time.',
    'This temporary password expires in 7 days.',
  ].join('\n')

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'Welcome to the team',
    lead: `You've been invited to join the ${resolvedBrand} staff workspace. Sign in with the credentials below, then choose your own password.`,
    details: [
      { label: 'Email', value: email },
      { label: 'Temporary Password', value: tempPassword },
      { label: 'Expires', value: '7 days' },
    ],
    note: {
      title: 'First sign-in',
      body: 'Use the temporary password once, then you will be prompted to create your own password. If you did not expect this invite, contact your administrator.',
    },
    primaryAction: { href: loginUrl, label: 'Sign in to staff workspace' },
    appUrl,
    brand,
    templateOverride,
    templateVars: { name, brandName: resolvedBrand, email, tempPassword },
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
  templateOverride,
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

  return styledEmail({
    headerBadge: '',
    subject,
    text: lines.join('\n'),
    eyebrow: '',
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
    templateOverride,
    templateVars: { filename, trigger, statusWord: success ? 'Completed' : 'Failed', statusWordLower: success ? 'completed' : 'failed', leadMessage: success ? 'An encrypted database backup completed successfully.' : 'An encrypted database backup failed. Review the control panel for details.', noteBody: error || '' },
})
}

function moneyOrDash(value) {
  return formatMoneyForDisplay(value) ?? '—'
}

/**
 * Daily ops summary for admins/managers — outstanding invoices + billing snapshot.
 * Sections expand when Vultr / Cloudflare / OpenRouter (Susan) integrations are enabled.
 */
export function buildDailySummaryEmail({
  reportDateLabel,
  recipientName,
  invoiceStats,
  outstandingInvoices = [],
  billing,
  susanActions = [],
  appUrl,
  brand,
  templateOverride,
}) {
  const base = String(appUrl || brand?.appUrl || '').replace(/\/$/, '')
  const outstandingTotal = moneyOrDash(invoiceStats?.outstandingTotal)
  const overdueCount = Number(invoiceStats?.overdueCount ?? 0)
  const outstandingCount = Number(invoiceStats?.outstandingCount ?? 0)
  const paidThisMonth = moneyOrDash(invoiceStats?.paidThisMonthTotal)
  const hasBilling = Boolean(billing?.configured?.vultr || billing?.configured?.cloudflare || billing?.configured?.openrouter)
  const susanEnabled = Boolean(billing?.configured?.openrouter)

  const subject = `Daily Summary — ${reportDateLabel}`
  const textLines = [
    recipientName ? `Hi ${recipientName},` : 'Hi,',
    '',
    `Daily summary for ${reportDateLabel}.`,
    '',
    `Outstanding invoices: ${outstandingCount} (${outstandingTotal})`,
    `Overdue: ${overdueCount}`,
    `Paid this month: ${paidThisMonth}`,
  ]
  if (hasBilling) {
    textLines.push(
      '',
      `Est. monthly ops: ${moneyOrDash(billing.totals?.estimatedMonthlyUsd)}`,
      `Est. yearly ops: ${moneyOrDash(billing.totals?.estimatedYearlyUsd)}`,
    )
  }
  if (outstandingInvoices.length) {
    textLines.push('', 'Outstanding invoices:')
    for (const row of outstandingInvoices) {
      textLines.push(
        `- ${row.invoiceNumber} | ${row.customerName} | ${row.vehicleLabel} | due ${row.dueDate || '—'} | ${moneyOrDash(row.balanceDue)}${row.overdue ? ' (overdue)' : ''}`,
      )
    }
  }
  if (susanActions.length) {
    textLines.push('', 'Susan recommends:')
    for (const action of susanActions) textLines.push(`- ${action}`)
  }
  if (base) {
    textLines.push('', `Billing: ${base}/billing`, `Invoices: ${base}/invoices`)
  }

  const t = EMAIL_TOKENS
  const sectionTitle = label => (
    `<div style="font-size:13px;line-height:18px;font-weight:700;color:${t.ink};font-family:${t.font};padding:0 0 10px 0;">${escapeHtml(label)}</div>`
  )

  const invoiceRowsHtml = outstandingInvoices.length
    ? outstandingInvoices.map((row, index) => {
        const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc'
        const dueColor = row.overdue ? '#b91c1c' : t.ink
        return [
          `<tr bgcolor="${bg}">`,
          `<td style="padding:10px 8px;border-top:1px solid ${t.border};font-size:12px;line-height:17px;font-family:${t.font};color:${t.ink};">${escapeHtml(row.invoiceNumber)}</td>`,
          `<td style="padding:10px 8px;border-top:1px solid ${t.border};font-size:12px;line-height:17px;font-family:${t.font};color:${t.ink};">${escapeHtml(row.customerName)}</td>`,
          `<td style="padding:10px 8px;border-top:1px solid ${t.border};font-size:12px;line-height:17px;font-family:${t.font};color:${t.muted};">${escapeHtml(row.vehicleLabel)}</td>`,
          `<td style="padding:10px 8px;border-top:1px solid ${t.border};font-size:12px;line-height:17px;font-family:${t.font};color:${dueColor};white-space:nowrap;">${escapeHtml(row.dueDate || '—')}${row.overdue ? '<br><span style="font-size:11px;font-weight:700;">Overdue</span>' : ''}</td>`,
          `<td align="right" style="padding:10px 8px;border-top:1px solid ${t.border};font-size:12px;line-height:17px;font-family:${t.font};color:${t.ink};font-weight:700;white-space:nowrap;">${escapeHtml(moneyOrDash(row.balanceDue))}</td>`,
          `</tr>`,
        ].join('')
      }).join('')
    : `<tr><td colspan="5" style="padding:14px 8px;border-top:1px solid ${t.border};font-size:13px;color:${t.muted};font-family:${t.font};">No outstanding customer invoices.</td></tr>`

  const invoiceTable = [
    sectionTitle('Outstanding invoices'),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid ${t.border};">`,
    `<tr bgcolor="#f8fafc">`,
    `<th align="left" style="padding:10px 8px;font-size:11px;line-height:14px;font-weight:700;color:${t.muted};font-family:${t.font};text-transform:uppercase;letter-spacing:0.04em;">Invoice</th>`,
    `<th align="left" style="padding:10px 8px;font-size:11px;line-height:14px;font-weight:700;color:${t.muted};font-family:${t.font};text-transform:uppercase;letter-spacing:0.04em;">Customer</th>`,
    `<th align="left" style="padding:10px 8px;font-size:11px;line-height:14px;font-weight:700;color:${t.muted};font-family:${t.font};text-transform:uppercase;letter-spacing:0.04em;">Vehicle</th>`,
    `<th align="left" style="padding:10px 8px;font-size:11px;line-height:14px;font-weight:700;color:${t.muted};font-family:${t.font};text-transform:uppercase;letter-spacing:0.04em;">Due</th>`,
    `<th align="right" style="padding:10px 8px;font-size:11px;line-height:14px;font-weight:700;color:${t.muted};font-family:${t.font};text-transform:uppercase;letter-spacing:0.04em;">Balance</th>`,
    `</tr>`,
    invoiceRowsHtml,
    `</table>`,
  ].join('')

  const billingParts = []
  if (hasBilling) {
    const details = [
      { label: 'Est. monthly', value: moneyOrDash(billing.totals?.estimatedMonthlyUsd) },
      { label: 'Est. yearly', value: moneyOrDash(billing.totals?.estimatedYearlyUsd) },
    ]
    if (billing.configured?.vultr) {
      details.push(
        { label: 'Hosting (monthly)', value: moneyOrDash(billing.totals?.breakdown?.vultrUsd) },
        { label: 'Vultr balance', value: moneyOrDash(billing.vultr?.accountBalance) },
      )
    }
    if (billing.configured?.cloudflare) {
      const dueSoon = (billing.cloudflare?.domains || []).filter(d => d.daysUntilRenewal <= 30).length
      details.push(
        { label: 'Domains', value: String(billing.cloudflare?.domains?.length ?? 0) },
        { label: 'Renewals ≤30 days', value: String(dueSoon) },
        { label: 'Domain yearly', value: moneyOrDash(billing.totals?.breakdownYearly?.cloudflareUsd) },
      )
    }
    if (billing.configured?.openrouter) {
      details.push(
        { label: 'Susan usage (month)', value: moneyOrDash(billing.totals?.breakdown?.openrouterUsd) },
        { label: 'Susan credit left', value: moneyOrDash(billing.openrouter?.remainingCredits ?? billing.openrouter?.limitRemaining) },
      )
    }
    billingParts.push(sectionTitle('Operations billing'))
    billingParts.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">`,
      ...details.map((row, index) => [
        `<tr>`,
        `<td style="padding:${index === 0 ? 0 : 8}px 12px 0 0;font-size:12px;color:${t.muted};font-family:${t.font};">${escapeHtml(row.label)}</td>`,
        `<td align="right" style="padding:${index === 0 ? 0 : 8}px 0 0 0;font-size:13px;font-weight:700;color:${t.ink};font-family:${t.font};">${escapeHtml(row.value)}</td>`,
        `</tr>`,
      ].join('')),
      `</table>`,
    )

    if (billing.configured?.vultr || billing.configured?.cloudflare || billing.configured?.openrouter) {
      const yearly = billing.totals?.breakdownYearly || {}
      billingParts.push(
        `<div style="padding-top:16px;">${sectionTitle('Year outlook')}</div>`,
        `<div style="font-size:13px;line-height:20px;color:${t.muted};font-family:${t.font};">`,
        `Projected full-year ops spend is <strong style="color:${t.ink};">${escapeHtml(moneyOrDash(billing.totals?.estimatedYearlyUsd))}</strong>`,
        billing.configured?.vultr ? ` · hosting ${escapeHtml(moneyOrDash(yearly.vultrUsd))}` : '',
        billing.configured?.cloudflare ? ` · domains ${escapeHtml(moneyOrDash(yearly.cloudflareUsd))}` : '',
        billing.configured?.openrouter ? ` · Susan ${escapeHtml(moneyOrDash(yearly.openrouterUsd))}` : '',
        `.</div>`,
      )
    }
  }

  let susanHtml = ''
  if (susanActions.length) {
    susanHtml = [
      `<div style="padding-top:8px;">${sectionTitle(susanEnabled ? 'Susan recommends' : 'Keep things running smooth')}</div>`,
      `<ul style="margin:0;padding:0 0 0 18px;color:${t.ink};font-size:13px;line-height:22px;font-family:${t.font};">`,
      ...susanActions.map(action => `<li style="padding:0 0 4px 0;">${escapeHtml(action)}</li>`),
      `</ul>`,
    ].join('')
  }

  const bodyHtml = [
    invoiceTable,
    billingParts.length ? `<div style="padding-top:22px;">${billingParts.join('')}</div>` : '',
    susanHtml ? `<div style="padding-top:22px;">${susanHtml}</div>` : '',
  ].filter(Boolean).join('')

  const lead = susanEnabled
    ? `Here's today's receivables snapshot${hasBilling ? ' and ops billing outlook' : ''}. Susan flagged a few items to keep cash flow and infrastructure smooth.`
    : `Here's today's receivables snapshot${hasBilling ? ' and ops billing outlook' : ''} for managers and admins.`

  return styledEmail({
    headerBadge: '',
    subject,
    text: textLines.join('\n'),
    eyebrow: '',
    headline: `Daily summary — ${reportDateLabel}`,
    lead,
    highlight: {
      label: 'Outstanding balance',
      value: outstandingTotal,
      status: overdueCount > 0 ? `${overdueCount} overdue` : `${outstandingCount} open`,
      statusTone: overdueCount > 0 ? 'warn' : (outstandingCount > 0 ? 'neutral' : 'ok'),
    },
    bodyHtml,
    details: [
      { label: 'Paid this month', value: paidThisMonth },
      { label: 'Drafts', value: String(invoiceStats?.draftCount ?? 0) },
      { label: 'Awaiting approval', value: String(invoiceStats?.pendingManagerApprovalCount ?? 0) },
    ],
    note: susanEnabled
      ? {
          title: 'From Susan',
          body: 'Review outstanding invoices for reconciliation, then clear any ops bills that are due so hosting, domains, and AI stay uninterrupted.',
        }
      : undefined,
    primaryAction: base
      ? { href: `${base}/invoices/reconcile`, label: 'Reconcile invoices' }
      : undefined,
    secondaryAction: base && hasBilling
      ? { href: `${base}/billing`, label: 'Open billing' }
      : undefined,
    appUrl,
    brand,
    templateOverride,
    templateVars: {
      reportDateLabel,
      recipientName: recipientName || '',
      outstandingTotal,
      outstandingCount: String(outstandingCount),
      overdueCount: String(overdueCount),
      paidThisMonth,
    },
  })
}

export function buildInvoiceAttachedEmail({
  recipientName,
  invoiceNumber,
  dueDate,
  total,
  appUrl,
  brand,
  templateOverride,
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: `Invoice ${invoiceNumber}`,
    lead: `Hello ${recipientName}, invoice ${invoiceNumber} is attached to this email as a PDF.`,
    highlight: totalLine
      ? {
          label: 'Invoice Total',
          value: totalLine,
          status: 'Ready',
          statusTone: 'ok',
        }
      : undefined,
    details: [
      { label: 'Invoice', value: invoiceNumber },
      dueLine ? { label: 'Due Date', value: dueLine } : null,
      { label: 'Recipient', value: recipientName },
      { label: 'Attachment', value: 'PDF included' },
    ].filter(Boolean),
    note: {
      title: 'Need help?',
      body: 'If you have questions, reply to this email or submit a request through your customer portal.',
    },
    appUrl,
    brand,
    templateOverride,
    templateVars: { recipientName, invoiceNumber, dueDate: dueLine || '', total: totalLine || '' },
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
  templateOverride,
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'New sign-in',
    lead: `Your staff account was used to sign in to ${resolvedBrand}.`,
    details: [
      { label: 'When', value: when },
      { label: 'User', value: name },
      email ? { label: 'Email', value: email } : null,
      location ? { label: 'Device Location', value: location } : null,
      ipLocation ? { label: 'Network Location', value: ipLocation } : null,
      accuracyLabel ? { label: 'Location Accuracy', value: accuracyLabel } : null,
      ipAddress ? { label: 'IP Address', value: ipAddress } : null,
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
    templateOverride,
    templateVars: { name, brandName: resolvedBrand, email, when, ipAddress, device: deviceLabel },
})
}

export function buildCustomerAutoResponderEmail({
  recipientName,
  subject,
  message,
  appUrl,
  brand,
  templateOverride,
}) {
  const resolvedBrand = brandNameFrom({ brand })
  const greeting = recipientName?.trim() ? `Hi ${recipientName.trim()},` : 'Hello,'
  const bodyParagraphs = String(message || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
  const t = EMAIL_TOKENS
  const bodyHtml = bodyParagraphs
    .map(p => `<p style="margin:0 0 14px;color:${t.ink};font-size:16px;line-height:26px;font-family:${t.font};">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const text = [greeting, '', ...bodyParagraphs, '', resolvedBrand].join('\n')

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
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
    templateOverride,
    templateVars: { recipientName, brandName: resolvedBrand, subject },
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
  templateOverride,
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'New deletion request',
    lead: `${submitterName} requested deletion of a ${entityTypeLabel.toLowerCase()}. Review the details and approve or deny the request.`,
    details: [
      { label: 'Record', value: entityLabel },
      { label: 'Type', value: entityTypeLabel },
      { label: 'Requested By', value: submitterName },
      { label: 'Reviewer', value: reviewerName },
    ],
    note: { title: 'Request reason', body: reason },
    primaryAction: { href: reviewUrl, label: 'Review request' },
    appUrl,
    brand,
    templateOverride,
    templateVars: { reviewerName, submitterName, entityTypeLabel, entityTypeLabelLower: entityTypeLabel.toLowerCase(), entityLabel, reason },
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
  templateOverride,
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
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
      reviewedByName ? { label: 'Reviewed By', value: reviewedByName } : null,
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
    templateOverride,
    templateVars: { requestorName, statusLabel, statusLabelTitle: titleCaseStatus(statusLabel), entityTypeLabel, entityTypeLabelLower: entityTypeLabel.toLowerCase(), entityLabel, reviewReason, reviewedByName },
})
}

export function buildUserSignupPendingEmail({
  adminName,
  userName,
  userEmail,
  usersUrl,
  appUrl,
  brand,
  templateOverride,
}) {
  const subject = `New User Awaiting Approval — ${userName}`
  const text = [
    `Hi ${adminName},`,
    '',
    `${userName} (${userEmail}) verified their email and is awaiting account approval.`,
    '',
    `Review users: ${usersUrl}`,
  ].join('\n')

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
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
    templateOverride,
    templateVars: { adminName, userName, userEmail },
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
  templateOverride,
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'Invoice needs approval',
    lead: `Invoice ${invoiceNumber} for ${customerName} is waiting for manager approval.`,
    highlight: totalLine
      ? {
          label: 'Invoice Total',
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
    templateOverride,
    templateVars: { approverName, invoiceNumber, customerName, total: totalLine || '' },
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
  templateOverride,
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'New customer service request',
    lead: `${customerName} submitted a service request. Check the portal for full details and next steps.`,
    details: [
      { label: 'Customer', value: customerName },
      { label: 'Vehicle', value: vehicleUnit },
      vehicleDetails ? { label: 'Vehicle Details', value: vehicleDetails } : null,
      { label: 'Category', value: serviceCategory },
      { label: 'Urgency', value: urgency },
      { label: 'Notified', value: recipientName },
    ].filter(Boolean),
    note: { title: 'Customer message', body: truncateEmailNote(message) },
    primaryAction: { href: detailUrl, label: 'View in portal' },
    footerNote: 'You received this because a customer submitted a service request in the portal.',
    appUrl,
    brand,
    templateOverride,
    templateVars: { recipientName, customerName, vehicleUnit, serviceCategory, urgency, message },
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
  templateOverride,
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'New customer change request',
    lead: `${customerName} submitted a ${requestKindLabel.toLowerCase()}. Review the request in the portal.`,
    details: [
      { label: 'Customer', value: customerName },
      { label: 'Request Type', value: requestKindLabel },
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
    templateOverride,
    templateVars: { recipientName, customerName, requestKindLabel, requestKindLabelLower: requestKindLabel.toLowerCase(), topic, message },
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
  templateOverride,
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

  return styledEmail({
    subject: mailSubject,
    text,
    eyebrow: '',
    headline,
    lead: `${customerName} emailed your company inbox. Sign in to DORINC, open Messages, and reply to the customer.`,
    details: [
      { label: 'Customer', value: customerName },
      { label: 'Email', value: customerEmail },
      subject?.trim() ? { label: 'Subject', value: subject.trim() } : null,
    ].filter(Boolean),
    bodyHtml: quotedMessage
      ? emailQuotedMessage(quotedMessage, {
          title: customerName,
          subtitle: customerEmail,
        })
      : undefined,
    primaryAction: { href: messagesUrl, label: 'Sign in & reply' },
    headerBadge: '',
    footerNote: `This email was sent because activity occurred in your ${brandNameFrom({ brand })} accounting workspace.`,
    appUrl,
    brand,
    templateOverride,
    templateVars: { recipientName, customerName, customerEmail, subject },
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
  templateOverride,
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
    `Open message: ${messagesUrl}`,
  ].join('\n')

  return styledEmail({
    subject,
    text,
    headerBadge: '',
    eyebrow: '',
    headline: `${senderName} sent a message`,
    lead: isTeamChat
      ? `You received a new message in the ${channelLabel} channel.`
      : `You received a new message from ${senderName}.`,
    bodyHtml: messagePreview
      ? emailQuotedMessage(String(messagePreview), {
          title: senderName,
          subtitle: channelLabel,
        })
      : undefined,
    details: [
      { label: 'Sent To', value: recipientName },
    ],
    primaryAction: { href: messagesUrl, label: 'Open message' },
    footerNote: `This email was sent because activity occurred in your ${brandNameFrom({ brand })} accounting workspace.`,
    appUrl,
    brand,
    templateOverride,
    templateVars: { recipientName, senderName, channelLabel, messagePreview },
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
  templateOverride,
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

  return styledEmail({
    headerBadge: '',
    subject,
    text,
    eyebrow: '',
    headline: 'Invoice needs to be completed',
    lead: senderName
      ? `${senderName} sent ${serviceLogLabel} to invoice. Open the draft and finish billing when you are ready.`
      : `${serviceLogLabel} was sent to invoice. Open the draft and finish billing when you are ready.`,
    highlight: {
      label: 'Service Log',
      value: serviceLogLabel,
      status: 'Needs completion',
      statusTone: 'warn',
    },
    details: [
      senderName ? { label: 'Sent By', value: senderName } : null,
      { label: 'Customer', value: customerName },
      { label: 'Vehicle', value: vehicleUnit },
      vehicleDetails ? { label: 'Vehicle Details', value: vehicleDetails } : null,
      invoiceNumber ? { label: 'Draft Invoice', value: invoiceNumber } : null,
      { label: 'Notified', value: recipientName },
    ].filter(Boolean),
    primaryAction: { href: invoiceUrl, label: 'Complete invoice' },
    secondaryAction: { href: serviceLogUrl, label: 'View service log' },
    footerNote: 'You received this because a service log was sent to invoice and needs billing completed.',
    appUrl,
    brand,
    templateOverride,
    templateVars: { recipientName, senderName, serviceLogLabel, customerName, vehicleUnit, invoiceNumber },
})
}
