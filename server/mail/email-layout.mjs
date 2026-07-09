/**
 * Shared DORINC transactional email layout.
 * Tokens mirror server/mail/email-styles.scss (inline CSS required for email clients).
 * Usable from Nuxt (TS) and Node workers (.mjs).
 */

export const EMAIL_BRAND_NAME = 'DORINC'
export const EMAIL_BRAND_LEGAL = 'Devon On Site Repairs Inc.'

/** Design tokens — keep in sync with email-styles.scss */
export const EMAIL_TOKENS = {
  bg: '#f8fafc',
  surface: '#ffffff',
  ink: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  accent: '#4f46e5',
  accentStrong: '#4338ca',
  accentSoft: '#eef2ff',
  accentLine: '#c7d2fe',
  line: '#e2e8f0',
  radius: '14px',
  radiusBtn: '10px',
  font: "'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif",
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
 * @param {string} href
 * @param {string} label
 * @returns {string}
 */
export function emailButton(href, label) {
  const t = EMAIL_TOKENS
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 8px;">`,
    `<tr><td align="left">`,
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 18px;background:${t.accent};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:${t.radiusBtn};font-family:${t.font};">${escapeHtml(label)}</a>`,
    `</td></tr></table>`,
  ].join('')
}

/**
 * @param {string} label
 * @param {string} innerHtml
 * @returns {string}
 */
export function emailPanel(label, innerHtml) {
  const t = EMAIL_TOKENS
  return [
    `<div style="margin:18px 0;padding:14px 16px;background:${t.accentSoft};border:1px solid ${t.accentLine};border-radius:${t.radiusBtn};">`,
    `<span style="display:block;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${t.accent};margin-bottom:6px;">${escapeHtml(label)}</span>`,
    `<div style="font-size:14px;line-height:1.5;color:${t.ink};">${innerHtml}</div>`,
    `</div>`,
  ].join('')
}

/**
 * @param {string} text
 * @returns {string}
 */
export function emailParagraph(text) {
  const t = EMAIL_TOKENS
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${t.ink};font-family:${t.font};">${text}</p>`
}

/**
 * @param {string} text
 * @returns {string}
 */
export function emailMuted(text) {
  const t = EMAIL_TOKENS
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:${t.muted};font-family:${t.font};">${text}</p>`
}

/**
 * Wrap body HTML in the shared modern white-card layout.
 *
 * @param {{
 *   title?: string,
 *   preheader?: string,
 *   bodyHtml: string,
 *   footerNote?: string,
 *   appUrl?: string,
 * }} opts
 * @returns {string}
 */
export function wrapEmailHtml(opts) {
  const t = EMAIL_TOKENS
  const brand = EMAIL_BRAND_NAME
  const title = opts.title ? escapeHtml(opts.title) : ''
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : ''
  const footerNote = opts.footerNote
    ? escapeHtml(opts.footerNote)
    : `© ${new Date().getFullYear()} ${EMAIL_BRAND_LEGAL}. All rights reserved.`
  const appUrl = opts.appUrl ? String(opts.appUrl).replace(/\/$/, '') : ''

  const brandBlock = appUrl
    ? `<a href="${escapeHtml(appUrl)}" style="display:inline-block;font-size:15px;font-weight:800;letter-spacing:-0.02em;color:${t.ink};text-decoration:none;font-family:${t.font};">${brand}</a>`
    : `<span style="display:inline-block;font-size:15px;font-weight:800;letter-spacing:-0.02em;color:${t.ink};font-family:${t.font};">${brand}</span>`

  const titleBlock = title
    ? `<h1 style="margin:0 0 16px;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${t.ink};font-family:${t.font};line-height:1.3;">${title}</h1>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${title || brand}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style type="text/css">
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; background: ${t.bg}; }
  a { color: ${t.accent}; }
  @media only screen and (max-width: 620px) {
    .email-card { width: 100% !important; }
    .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${t.bg};color:${t.ink};font-family:${t.font};">
${preheader ? `<div style="display:none;font-size:1px;color:${t.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ''}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${t.bg};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" class="email-card" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:${t.surface};border:1px solid ${t.line};border-radius:${t.radius};overflow:hidden;">
        <tr>
          <td class="email-pad" style="padding:24px 28px 16px;border-bottom:1px solid ${t.line};">
            ${brandBlock}
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:28px;font-size:15px;line-height:1.55;color:${t.ink};font-family:${t.font};">
            ${titleBlock}
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:18px 28px 24px;border-top:1px solid ${t.line};font-size:12px;line-height:1.5;color:${t.faint};font-family:${t.font};">
            ${footerNote}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/**
 * Build a complete email payload with shared layout.
 *
 * @param {{
 *   subject: string,
 *   text: string,
 *   title?: string,
 *   preheader?: string,
 *   bodyHtml: string,
 *   footerNote?: string,
 *   appUrl?: string,
 * }} opts
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildStyledEmail(opts) {
  return {
    subject: opts.subject,
    text: opts.text,
    html: wrapEmailHtml({
      title: opts.title,
      preheader: opts.preheader ?? opts.subject,
      bodyHtml: opts.bodyHtml,
      footerNote: opts.footerNote,
      appUrl: opts.appUrl,
    }),
  }
}
