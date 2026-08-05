/**
 * Shared transactional email layout.
 * Flat white shell matching the app notification template.
 * Branding comes from business settings + invoice logo when provided.
 * Usable from Nuxt (TS) and Node workers (.mjs).
 */

export const EMAIL_BRAND_NAME = 'DORINC'
export const EMAIL_BRAND_LEGAL = 'Devon On Site Repairs Inc.'

/** Design tokens — keep in sync with email-styles.scss */
export const EMAIL_TOKENS = {
  bg: '#f4f7fb',
  surface: '#ffffff',
  ink: '#111827',
  muted: '#6b7280',
  faint: '#9ca3af',
  accent: '#4f46e5',
  accentStrong: '#4338ca',
  accentSoft: '#eef2ff',
  accentLine: '#e5e7eb',
  line: '#eef0f3',
  border: '#e5e7eb',
  buttonBg: '#2563eb',
  radius: '8px',
  radiusBtn: '7px',
  font: 'Arial, Helvetica, sans-serif',
}

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Format a phone number for display as `(xxx) xxx xxxx`.
 * Keep in sync with shared/format/phone.ts
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function formatPhoneDisplay(value) {
  if (value == null) return ''
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === '—' || trimmed === '-') return trimmed

  const digits = trimmed.replace(/\D/g, '')
  let local = digits
  if (local.length === 11 && local.startsWith('1')) local = local.slice(1)
  if (local.length === 10) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)} ${local.slice(6)}`
  }

  return trimmed
}

/**
 * @typedef {{
 *   brandName?: string,
 *   brandLegal?: string,
 *   brandTagline?: string,
 *   logoUrl?: string | null,
 *   logoInitial?: string,
 *   addressLines?: string[],
 *   phone?: string,
 *   email?: string,
 *   website?: string,
 *   appUrl?: string,
 *   settingsUrl?: string,
 *   helpUrl?: string,
 *   signInUrl?: string,
 * }} EmailBrandOpts
 */

/**
 * @param {EmailBrandOpts | null | undefined} brand
 * @param {string} [appUrl]
 * @returns {Required<Pick<EmailBrandOpts, 'brandName' | 'brandLegal' | 'brandTagline' | 'logoInitial' | 'appUrl'>> & EmailBrandOpts}
 */
export function normalizeEmailBrand(brand, appUrl = '') {
  const base = String(brand?.appUrl || appUrl || '').replace(/\/$/, '')
  const brandName = brand?.brandName?.trim() || EMAIL_BRAND_NAME
  return {
    brandName,
    brandLegal: brand?.brandLegal?.trim() || EMAIL_BRAND_LEGAL,
    brandTagline: brand?.brandTagline?.trim() || 'Onsite repairs',
    logoUrl: brand?.logoUrl ?? null,
    logoInitial: brand?.logoInitial?.trim() || brandName.charAt(0).toUpperCase() || 'D',
    addressLines: Array.isArray(brand?.addressLines) ? brand.addressLines.filter(Boolean) : [],
    phone: formatPhoneDisplay(brand?.phone?.trim() || ''),
    email: brand?.email?.trim() || '',
    website: brand?.website?.trim() || '',
    appUrl: base,
    settingsUrl: brand?.settingsUrl || (base ? `${base}/admin?tab=notifications` : '#'),
    helpUrl: brand?.helpUrl || (base ? `${base}/help` : '#'),
    signInUrl: brand?.signInUrl || (base ? `${base}/auth/login` : '#'),
  }
}

/**
 * @param {string} href
 * @param {string} label
 * @returns {string}
 */
export function emailButton(href, label) {
  return `<a href="${escapeHtml(href)}" class="button" style="display:inline-block;padding:13px 20px;background:${EMAIL_TOKENS.buttonBg};color:#ffffff !important;border-radius:${EMAIL_TOKENS.radiusBtn};font-size:14px;font-weight:700;line-height:18px;text-decoration:none;font-family:${EMAIL_TOKENS.font};">${escapeHtml(label)}</a>`
}

/**
 * @param {string} href
 * @param {string} label
 * @returns {string}
 */
export function emailSecondaryLink(href, label) {
  return `<a href="${escapeHtml(href)}" class="secondary-link" style="font-size:13px;font-weight:600;color:#4b5563;text-decoration:none;font-family:${EMAIL_TOKENS.font};">${escapeHtml(label)}</a>`
}

/**
 * @param {string} label
 * @param {string} innerHtml
 * @returns {string}
 */
export function emailPanel(label, innerHtml) {
  return [
    `<table role="presentation" width="100%" style="border:1px solid ${EMAIL_TOKENS.border};border-radius:${EMAIL_TOKENS.radius};margin:0 0 14px;">`,
    `<tr><td style="padding:18px 20px;">`,
    `<div style="color:#374151;font-size:13px;font-weight:700;padding-bottom:5px;font-family:${EMAIL_TOKENS.font};">${escapeHtml(label)}</div>`,
    `<div style="color:${EMAIL_TOKENS.muted};font-size:13px;line-height:20px;font-family:${EMAIL_TOKENS.font};">${innerHtml}</div>`,
    `</td></tr></table>`,
  ].join('')
}

/**
 * @param {string} text
 * @returns {string}
 */
export function emailParagraph(text) {
  return `<p style="margin:0 0 14px;color:${EMAIL_TOKENS.muted};font-size:15px;line-height:24px;font-family:${EMAIL_TOKENS.font};">${text}</p>`
}

/**
 * @param {string} text
 * @returns {string}
 */
export function emailMuted(text) {
  return `<p style="margin:0 0 14px;color:${EMAIL_TOKENS.muted};font-size:13px;line-height:20px;font-family:${EMAIL_TOKENS.font};">${text}</p>`
}

/**
 * @param {string} label
 * @param {'ok'|'warn'|'error'|'neutral'} [tone]
 * @returns {string}
 */
export function emailBadge(label, tone = 'neutral') {
  const colors = {
    ok: { fg: '#15803d', border: '#bbf7d0' },
    warn: { fg: '#b45309', border: '#fde68a' },
    error: { fg: '#b91c1c', border: '#fecaca' },
    neutral: { fg: '#475569', border: '#dbe3ee' },
  }
  const c = colors[tone] ?? colors.neutral
  return `<div style="display:inline-block;padding:5px 9px;border:1px solid ${c.border};border-radius:999px;color:${c.fg};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-family:${EMAIL_TOKENS.font};">${escapeHtml(label)}</div>`
}

/**
 * @param {string} label
 * @returns {string}
 */
export function emailEyebrow(label) {
  return emailBadge(label, 'neutral')
}

/**
 * @param {{ label: string, value: string, status?: string, statusTone?: 'ok'|'warn'|'error'|'neutral' }} highlight
 * @returns {string}
 */
export function emailHighlight(highlight) {
  const statusHtml = highlight.status
    ? (() => {
        const tone = highlight.statusTone ?? 'ok'
        const colors = {
          ok: { fg: '#15803d', border: '#bbf7d0' },
          warn: { fg: '#b45309', border: '#fde68a' },
          error: { fg: '#b91c1c', border: '#fecaca' },
          neutral: { fg: '#475569', border: '#dbe3ee' },
        }
        const c = colors[tone] ?? colors.ok
        return `<div style="display:inline-block;padding:7px 10px;border:1px solid ${c.border};border-radius:6px;color:${c.fg};font-size:12px;font-weight:700;font-family:${EMAIL_TOKENS.font};">${escapeHtml(highlight.status)}</div>`
      })()
    : ''

  return [
    `<table role="presentation" width="100%" style="border-top:1px solid ${EMAIL_TOKENS.border};border-bottom:1px solid ${EMAIL_TOKENS.border};">`,
    `<tr>`,
    `<td style="padding:24px 0;">`,
    `<div style="font-size:12px;color:${EMAIL_TOKENS.muted};padding-bottom:7px;font-family:${EMAIL_TOKENS.font};">${escapeHtml(highlight.label)}</div>`,
    `<div style="color:${EMAIL_TOKENS.ink};font-size:34px;line-height:40px;font-weight:750;letter-spacing:-0.6px;font-family:${EMAIL_TOKENS.font};">${escapeHtml(highlight.value)}</div>`,
    `</td>`,
    statusHtml ? `<td align="right" valign="middle" style="padding-top:0;text-align:right;">${statusHtml}</td>` : '',
    `</tr></table>`,
  ].join('')
}

/**
 * @param {Array<{ label: string, value: string }>} rows
 * @returns {string}
 */
export function emailDetails(rows) {
  if (!rows?.length) return ''
  const valueStyle = [
    `color:${EMAIL_TOKENS.ink}`,
    'font-size:14px',
    'font-weight:600',
    'line-height:20px',
    `font-family:${EMAIL_TOKENS.font}`,
    'word-break:break-word',
    '-webkit-hyphens:none',
    'hyphens:none',
  ].join(';')
  const labelStyle = [
    `color:${EMAIL_TOKENS.muted}`,
    'font-size:12px',
    'line-height:20px',
    `font-family:${EMAIL_TOKENS.font}`,
    'padding-right:12px',
    'white-space:nowrap',
  ].join(';')

  const items = rows.map((row, index) => {
    const isLast = index === rows.length - 1
    return [
      `<tr>`,
      `<td style="padding:0 0 ${isLast ? '0' : '14px'} 0;">`,
      `<table role="presentation" width="100%"><tr>`,
      `<td width="34%" valign="top" style="${labelStyle}">${escapeHtml(row.label)}</td>`,
      `<td valign="top" style="${valueStyle}">${escapeHtml(row.value)}</td>`,
      `</tr></table>`,
      `</td>`,
      `</tr>`,
    ].join('')
  })

  return [
    `<div style="color:${EMAIL_TOKENS.ink};font-size:14px;font-weight:700;padding-bottom:16px;font-family:${EMAIL_TOKENS.font};">Details</div>`,
    `<table role="presentation" width="100%">${items.join('')}</table>`,
  ].join('')
}

/**
 * Prominent quoted message block (no panel border).
 * @param {string} text
 * @returns {string}
 */
export function emailQuotedMessage(text) {
  const body = escapeHtml(String(text ?? '').trim())
  if (!body) return ''
  return `<p style="margin:0;color:${EMAIL_TOKENS.ink};font-size:19px;line-height:30px;font-weight:700;font-style:italic;font-family:${EMAIL_TOKENS.font};">&ldquo;${body}&rdquo;</p>`
}

/**
 * @param {{ title: string, body: string }} note
 * @returns {string}
 */
export function emailNote(note) {
  return [
    `<table role="presentation" width="100%" style="border:1px solid ${EMAIL_TOKENS.border};border-radius:${EMAIL_TOKENS.radius};">`,
    `<tr><td style="padding:18px 20px;">`,
    `<div style="color:#374151;font-size:13px;font-weight:700;padding-bottom:5px;font-family:${EMAIL_TOKENS.font};">${escapeHtml(note.title)}</div>`,
    `<div style="color:${EMAIL_TOKENS.muted};font-size:13px;line-height:20px;font-family:${EMAIL_TOKENS.font};">${escapeHtml(note.body)}</div>`,
    `</td></tr></table>`,
  ].join('')
}

/**
 * @param {{ primary?: { href: string, label: string }, secondary?: { href: string, label: string } }} actions
 * @returns {string}
 */
export function emailActions(actions) {
  if (!actions?.primary && !actions?.secondary) return ''
  return [
    `<table role="presentation" width="100%"><tr><td align="center">`,
    `<table role="presentation"><tr>`,
    actions.primary
      ? `<td>${emailButton(actions.primary.href, actions.primary.label)}</td>`
      : '',
    actions.secondary
      ? `<td style="padding-left:18px;">${emailSecondaryLink(actions.secondary.href, actions.secondary.label)}</td>`
      : '',
    `</tr></table>`,
    `</td></tr></table>`,
  ].join('')
}

/**
 * Wrap body HTML in the shared flat white notification layout.
 *
 * @param {{
 *   title?: string,
 *   preheader?: string,
 *   eyebrow?: string,
 *   headline?: string,
 *   lead?: string,
 *   bodyHtml?: string,
 *   highlightHtml?: string,
 *   detailsHtml?: string,
 *   noteHtml?: string,
 *   actionsHtml?: string,
 *   footerNote?: string | null,
 *   footerLinks?: boolean,
 *   footerAddress?: boolean,
 *   headerBadge?: string,
 *   appUrl?: string,
 *   brand?: EmailBrandOpts,
 *   logoUrl?: string | null,
 * }} opts
 * @returns {string}
 */
export function wrapEmailHtml(opts) {
  const t = EMAIL_TOKENS
  const brand = normalizeEmailBrand(opts.brand, opts.appUrl)
  const brandName = brand.brandName
  const title = opts.title ? escapeHtml(opts.title) : escapeHtml(brandName)
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : ''
  const headline = opts.headline ? escapeHtml(opts.headline) : (opts.title ? escapeHtml(opts.title) : '')
  const lead = opts.lead ? escapeHtml(opts.lead) : ''

  const addressBlock = [
    brand.brandLegal,
    ...brand.addressLines,
    brand.phone,
    brand.email,
  ].filter(Boolean).map(line => escapeHtml(line)).join('<br>')

  const footerNote = opts.footerNote === null
    ? ''
    : (opts.footerNote !== undefined
        ? escapeHtml(opts.footerNote)
        : `This notification was sent because activity occurred in your ${brandName} accounting workspace.`)
  const headerBadge = opts.headerBadge !== undefined ? escapeHtml(opts.headerBadge) : 'Notification'
  const showFooterLinks = opts.footerLinks !== false
  const showFooterAddress = opts.footerAddress !== false
  const showFooter = Boolean(footerNote || showFooterLinks || (showFooterAddress && addressBlock))

  const mainIntro = [
    opts.eyebrow ? `<div style="margin-bottom:0;">${emailEyebrow(opts.eyebrow)}</div>` : '',
    headline
      ? `<h1 style="margin:18px 0 0;color:${t.ink};font-size:28px;line-height:36px;letter-spacing:-0.5px;font-weight:750;font-family:${t.font};">${headline}</h1>`
      : '',
    lead
      ? `<p style="margin:14px 0 0;color:${t.muted};font-size:15px;line-height:24px;font-family:${t.font};">${lead}</p>`
      : '',
  ].filter(Boolean).join('')

  const bodyStyle = [
    'margin:0',
    'padding:0',
    'width:100%',
    `background:${t.bg}`,
    'color:#1f2937',
    `font-family:${t.font}`,
    '-webkit-font-smoothing:antialiased',
    '-webkit-text-size-adjust:100%',
  ].join(';')
  const shellStyle = `width:100%;background:${t.bg};border-spacing:0;border-collapse:collapse;`
  const outerStyle = 'padding:28px 12px;'
  const containerStyle = [
    `background:${t.surface}`,
    `border:1px solid ${t.border}`,
    'border-radius:18px',
    'box-shadow:0 12px 36px rgba(15,23,42,.07)',
    'width:100%',
    'max-width:620px',
    'margin:0 auto',
    'border-spacing:0',
    'border-collapse:collapse',
  ].join(';')
  const sidePad = 'padding-left:28px;padding-right:28px;'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${title}</title>
</head>
<body style="${bodyStyle}">
  ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>` : ''}

  <table role="presentation" width="100%" style="${shellStyle}">
    <tr>
      <td align="center" style="${outerStyle}">
        <table role="presentation" width="100%" style="${containerStyle}">

          <!-- Header -->
          <tr>
            <td style="${sidePad}padding-top:32px;padding-bottom:24px;">
              <table role="presentation" width="100%">
                <tr>
                  <td valign="middle">
                    <div style="font-size:21px;line-height:28px;font-weight:800;letter-spacing:-0.4px;color:${t.ink};font-family:${t.font};">${escapeHtml(brandName)}</div>
                    ${brand.brandTagline
                      ? `<div style="font-size:12px;line-height:18px;color:${t.muted};padding-top:4px;font-family:${t.font};">${escapeHtml(brand.brandTagline)}</div>`
                      : ''}
                  </td>
                  <td align="right" valign="middle" style="font-size:12px;color:${t.faint};font-family:${t.font};white-space:nowrap;">
                    ${headerBadge}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="${sidePad}">
              <div style="height:1px; background:${t.line};"></div>
            </td>
          </tr>

          ${mainIntro
            ? `<!-- Main content -->
          <tr>
            <td style="${sidePad}padding-top:42px;padding-bottom:10px;">
              ${mainIntro}
            </td>
          </tr>`
            : ''}

          ${opts.highlightHtml
            ? `<!-- Highlight -->
          <tr>
            <td style="${sidePad}padding-top:28px;">
              ${opts.highlightHtml}
            </td>
          </tr>`
            : ''}

          ${opts.detailsHtml
            ? `<!-- Details -->
          <tr>
            <td style="${sidePad}padding-top:30px;">
              ${opts.detailsHtml}
            </td>
          </tr>`
            : ''}

          ${opts.bodyHtml
            ? `<!-- Body -->
          <tr>
            <td style="${sidePad}padding-top:24px;">
              ${opts.bodyHtml}
            </td>
          </tr>`
            : ''}

          ${opts.noteHtml
            ? `<!-- Note -->
          <tr>
            <td style="${sidePad}padding-top:30px;">
              ${opts.noteHtml}
            </td>
          </tr>`
            : ''}

          ${opts.actionsHtml
            ? `<!-- Actions -->
          <tr>
            <td style="${sidePad}padding-top:30px;padding-bottom:38px;" align="center">
              ${opts.actionsHtml}
            </td>
          </tr>`
            : `<tr><td style="padding-bottom:38px;"></td></tr>`}

          ${showFooter
            ? `<!-- Footer divider -->
          <tr>
            <td style="${sidePad}">
              <div style="height:1px; background:${t.line};"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="${sidePad}padding-top:24px;padding-bottom:36px;color:${t.faint};font-size:11px;line-height:18px;font-family:${t.font};">
              ${footerNote ? `<p style="margin:0;">${footerNote}</p>` : ''}
              ${showFooterLinks ? `<p style="margin:10px 0 0;">
                <a href="${escapeHtml(brand.settingsUrl)}" style="color:#6b7280;">Notification settings</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="${escapeHtml(brand.helpUrl)}" style="color:#6b7280;">Help center</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="${escapeHtml(brand.signInUrl)}" style="color:#6b7280;">Sign in</a>
              </p>` : ''}
              ${showFooterAddress && addressBlock ? `<p style="margin:16px 0 0;">${addressBlock}</p>` : ''}
            </td>
          </tr>
          `
            : ''}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Build a complete email payload with the shared notification layout.
 *
 * @param {{
 *   subject: string,
 *   text: string,
 *   title?: string,
 *   preheader?: string,
 *   eyebrow?: string,
 *   headline?: string,
 *   lead?: string,
 *   bodyHtml?: string,
 *   highlight?: { label: string, value: string, status?: string, statusTone?: 'ok'|'warn'|'error'|'neutral' },
 *   details?: Array<{ label: string, value: string }>,
 *   note?: { title: string, body: string },
 *   primaryAction?: { href: string, label: string },
 *   secondaryAction?: { href: string, label: string },
 *   footerNote?: string,
 *   footerLinks?: boolean,
 *   footerAddress?: boolean,
 *   appUrl?: string,
 *   brand?: EmailBrandOpts,
 * }} opts
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildStyledEmail(opts) {
  const brand = normalizeEmailBrand(opts.brand, opts.appUrl)
  return {
    subject: opts.subject,
    text: opts.text,
    html: wrapEmailHtml({
      title: opts.title ?? opts.headline,
      preheader: opts.preheader ?? opts.subject,
      eyebrow: opts.eyebrow,
      headline: opts.headline ?? opts.title,
      lead: opts.lead,
      bodyHtml: opts.bodyHtml,
      highlightHtml: opts.highlight ? emailHighlight(opts.highlight) : undefined,
      detailsHtml: opts.details?.length ? emailDetails(opts.details) : undefined,
      noteHtml: opts.note ? emailNote(opts.note) : undefined,
      actionsHtml: emailActions({
        primary: opts.primaryAction,
        secondary: opts.secondaryAction,
      }) || undefined,
      footerNote: opts.footerNote,
      footerLinks: opts.footerLinks,
      footerAddress: opts.footerAddress,
      appUrl: brand.appUrl,
      brand,
    }),
  }
}
