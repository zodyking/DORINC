/**
 * Shared transactional email layout.
 * Flat white shell: company name only in the header (no type badge), blue eyebrow
 * in the body, full-width dark CTA. Branding comes from business settings when
 * provided. Usable from Nuxt (TS) and Node workers (.mjs).
 */

export const EMAIL_BRAND_NAME = 'DORINC'
export const EMAIL_BRAND_LEGAL = 'Devon On Site Repairs Inc.'

/** Design tokens — keep in sync with email-styles.scss */
export const EMAIL_TOKENS = {
  bg: '#ffffff',
  surface: '#ffffff',
  ink: '#111827',
  muted: '#6b7280',
  faint: '#9ca3af',
  accent: '#2563eb',
  accentStrong: '#1d4ed8',
  accentSoft: '#eff6ff',
  accentLine: '#2563eb',
  line: '#e5e7eb',
  border: '#e5e7eb',
  buttonBg: '#111827',
  radius: '6px',
  radiusBtn: '6px',
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
 * Full-width primary CTA (dark fill).
 * @param {string} href
 * @param {string} label
 * @returns {string}
 */
export function emailButton(href, label) {
  const t = EMAIL_TOKENS
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">`,
    `<tr>`,
    `<td align="center" bgcolor="${t.buttonBg}" style="background:${t.buttonBg};border-radius:${t.radiusBtn};">`,
    `<a href="${escapeHtml(href)}" class="button" style="display:block;width:100%;padding:14px 20px;color:#ffffff!important;border-radius:${t.radiusBtn};font-size:14px;line-height:18px;font-weight:700;text-align:center;text-decoration:none;box-sizing:border-box;font-family:${t.font};">${escapeHtml(label)}</a>`,
    `</td>`,
    `</tr>`,
    `</table>`,
  ].join('')
}

/**
 * @param {string} href
 * @param {string} label
 * @returns {string}
 */
export function emailSecondaryLink(href, label) {
  return `<a href="${escapeHtml(href)}" class="secondary-link" style="font-size:13px;font-weight:600;color:#6b7280;text-decoration:underline;font-family:${EMAIL_TOKENS.font};">${escapeHtml(label)}</a>`
}

/**
 * @param {string} label
 * @param {string} innerHtml
 * @returns {string}
 */
export function emailPanel(label, innerHtml) {
  const t = EMAIL_TOKENS
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">`,
    `<tr><td style="padding:20px 22px;background:${t.surface};border:1px solid ${t.border};border-left:3px solid ${t.accent};">`,
    `<div style="font-size:13px;line-height:20px;font-weight:700;color:${t.ink};font-family:${t.font};">${escapeHtml(label)}</div>`,
    `<div style="padding-top:14px;font-size:15px;line-height:24px;color:#374151;font-family:${t.font};">${innerHtml}</div>`,
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
 * Blue uppercase eyebrow label (not a pill).
 * @param {string} label
 * @returns {string}
 */
export function emailEyebrow(label) {
  const t = EMAIL_TOKENS
  return `<div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${t.accent};font-family:${t.font};">${escapeHtml(label)}</div>`
}

/**
 * @param {{ label: string, value: string, status?: string, statusTone?: 'ok'|'warn'|'error'|'neutral' }} highlight
 * @returns {string}
 */
export function emailHighlight(highlight) {
  const t = EMAIL_TOKENS
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
        return `<div style="display:inline-block;padding:7px 10px;border:1px solid ${c.border};border-radius:6px;color:${c.fg};font-size:12px;font-weight:700;font-family:${t.font};">${escapeHtml(highlight.status)}</div>`
      })()
    : ''

  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid ${t.border};border-left:3px solid ${t.accent};">`,
    `<tr>`,
    `<td style="padding:20px 22px;">`,
    `<div style="font-size:12px;line-height:18px;color:${t.muted};padding-bottom:6px;font-family:${t.font};">${escapeHtml(highlight.label)}</div>`,
    `<div style="color:${t.ink};font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.4px;font-family:${t.font};">${escapeHtml(highlight.value)}</div>`,
    statusHtml ? `<div style="padding-top:12px;">${statusHtml}</div>` : '',
    `</td>`,
    `</tr></table>`,
  ].join('')
}

/**
 * @param {Array<{ label: string, value: string }>} rows
 * @returns {string}
 */
export function emailDetails(rows) {
  if (!rows?.length) return ''
  const t = EMAIL_TOKENS
  const items = rows.map((row, index) => {
    const padTop = index === 0 ? '0' : '10'
    return [
      `<tr>`,
      `<td style="padding:${padTop}px 14px 0 0;font-size:12px;line-height:18px;color:${t.muted};white-space:nowrap;font-family:${t.font};">${escapeHtml(row.label)}</td>`,
      `<td style="padding:${padTop}px 0 0 0;font-size:13px;line-height:18px;font-weight:600;color:${t.ink};font-family:${t.font};">${escapeHtml(row.value)}</td>`,
      `</tr>`,
    ].join('')
  })

  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`,
    items.join(''),
    `</table>`,
  ].join('')
}

/**
 * Message / quote card with left accent border.
 * @param {string} text
 * @param {{ title?: string, subtitle?: string }} [meta]
 * @returns {string}
 */
export function emailQuotedMessage(text, meta = {}) {
  const t = EMAIL_TOKENS
  const body = escapeHtml(String(text ?? '').trim())
  if (!body && !meta.title) return ''
  const title = meta.title ? escapeHtml(meta.title) : ''
  const subtitle = meta.subtitle ? escapeHtml(meta.subtitle) : ''

  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">`,
    `<tr>`,
    `<td style="padding:20px 22px;background:${t.surface};border:1px solid ${t.border};border-left:3px solid ${t.accent};">`,
    title ? `<div style="font-size:13px;line-height:20px;font-weight:700;color:${t.ink};font-family:${t.font};">${title}</div>` : '',
    subtitle ? `<div style="padding-top:2px;font-size:12px;line-height:18px;color:${t.muted};font-family:${t.font};">${subtitle}</div>` : '',
    body
      ? `<div style="padding-top:${title || subtitle ? '14' : '0'}px;font-size:15px;line-height:24px;color:#374151;font-family:${t.font};">${body}</div>`
      : '',
    `</td>`,
    `</tr>`,
    `</table>`,
  ].join('')
}

/**
 * @param {{ title: string, body: string }} note
 * @returns {string}
 */
export function emailNote(note) {
  return emailQuotedMessage(note.body, { title: note.title })
}

/**
 * @param {{ primary?: { href: string, label: string }, secondary?: { href: string, label: string } }} actions
 * @returns {string}
 */
export function emailActions(actions) {
  if (!actions?.primary && !actions?.secondary) return ''
  const parts = []
  if (actions.primary) {
    parts.push(emailButton(actions.primary.href, actions.primary.label))
  }
  if (actions.secondary) {
    parts.push(
      `<div style="padding-top:14px;text-align:center;">${emailSecondaryLink(actions.secondary.href, actions.secondary.label)}</div>`,
    )
  }
  return parts.join('')
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
 *   headerBadge?: string, // ignored — kept for call-site compatibility
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
    brand.brandLegal || brandName,
    ...brand.addressLines,
    brand.phone,
    brand.email,
  ].filter(Boolean).map(line => escapeHtml(line)).join('<br>')

  const footerNote = opts.footerNote === null
    ? ''
    : (opts.footerNote !== undefined
        ? escapeHtml(opts.footerNote)
        : `This email was sent because activity occurred in your ${brandName} accounting workspace.`)
  const showFooterLinks = opts.footerLinks !== false
  const showFooterAddress = opts.footerAddress !== false
  const showFooter = Boolean(footerNote || showFooterLinks || (showFooterAddress && addressBlock))

  const mainIntro = [
    opts.eyebrow ? emailEyebrow(opts.eyebrow) : '',
    headline
      ? `<h1 style="margin:12px 0 0 0;font-size:28px;line-height:36px;font-weight:700;letter-spacing:-0.5px;color:${t.ink};font-family:${t.font};">${headline}</h1>`
      : '',
    lead
      ? `<p style="margin:12px 0 0 0;font-size:15px;line-height:24px;color:${t.muted};font-family:${t.font};">${lead}</p>`
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
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ''}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.bg}" style="width:100%;background:${t.bg};border-collapse:collapse;border-spacing:0;">
    <tr>
      <td align="center" bgcolor="${t.bg}" style="padding:0 20px;background:${t.bg};">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.surface}" style="width:100%;max-width:620px;margin:0 auto;background:${t.surface};border-collapse:collapse;border-spacing:0;">

          <!-- Header: company name only (no type badge — badges sat flush against the brand) -->
          <tr>
            <td bgcolor="${t.surface}" style="padding:34px 0 24px 0;background:${t.surface};border-bottom:1px solid ${t.border};">
              <div style="font-size:20px;line-height:27px;font-weight:700;letter-spacing:-0.3px;color:${t.ink};font-family:${t.font};">
                ${escapeHtml(brandName)}
              </div>
            </td>
          </tr>

          ${mainIntro
            ? `<!-- Main content -->
          <tr>
            <td bgcolor="${t.surface}" style="padding:42px 0 0 0;background:${t.surface};">
              ${mainIntro}
            </td>
          </tr>`
            : ''}

          ${opts.highlightHtml
            ? `<!-- Highlight -->
          <tr>
            <td bgcolor="${t.surface}" style="padding:30px 0 0 0;background:${t.surface};">
              ${opts.highlightHtml}
            </td>
          </tr>`
            : ''}

          ${opts.bodyHtml
            ? `<!-- Body -->
          <tr>
            <td bgcolor="${t.surface}" style="padding:30px 0 0 0;background:${t.surface};">
              ${opts.bodyHtml}
            </td>
          </tr>`
            : ''}

          ${opts.noteHtml
            ? `<!-- Note -->
          <tr>
            <td bgcolor="${t.surface}" style="padding:30px 0 0 0;background:${t.surface};">
              ${opts.noteHtml}
            </td>
          </tr>`
            : ''}

          ${opts.detailsHtml
            ? `<!-- Details -->
          <tr>
            <td bgcolor="${t.surface}" style="padding:24px 0 0 0;background:${t.surface};">
              ${opts.detailsHtml}
            </td>
          </tr>`
            : ''}

          ${opts.actionsHtml
            ? `<!-- Action -->
          <tr>
            <td bgcolor="${t.surface}" style="padding:32px 0 42px 0;background:${t.surface};">
              ${opts.actionsHtml}
            </td>
          </tr>`
            : `<tr><td style="padding-bottom:42px;"></td></tr>`}

          ${showFooter
            ? `<!-- Footer -->
          <tr>
            <td bgcolor="${t.surface}" style="padding:24px 0 36px 0;background:${t.surface};border-top:1px solid ${t.border};color:${t.faint};font-size:11px;line-height:18px;font-family:${t.font};">
              ${footerNote ? `<p style="margin:0;">${footerNote}</p>` : ''}
              ${showFooterLinks
                ? `<p style="margin:12px 0 0 0;">
                <a href="${escapeHtml(brand.settingsUrl)}" style="color:#6b7280;text-decoration:underline;">Notification settings</a>
                <span style="padding:0 7px;color:#d1d5db;">·</span>
                <a href="${escapeHtml(brand.helpUrl)}" style="color:#6b7280;text-decoration:underline;">Help center</a>
                <span style="padding:0 7px;color:#d1d5db;">·</span>
                <a href="${escapeHtml(brand.signInUrl)}" style="color:#6b7280;text-decoration:underline;">Sign in</a>
              </p>`
                : ''}
              ${showFooterAddress && addressBlock ? `<p style="margin:18px 0 0 0;">${addressBlock}</p>` : ''}
            </td>
          </tr>`
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
 *   headerBadge?: string,
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
      headerBadge: opts.headerBadge,
      appUrl: brand.appUrl,
      brand,
    }),
  }
}
