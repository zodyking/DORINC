/**
 * Merge Control Panel email template overrides into buildStyledEmail options.
 * Shared by Nuxt API and workers (plain ESM).
 */

/**
 * @param {string} template
 * @param {Record<string, string | null | undefined>} vars
 */
export function interpolateEmailTemplate(template, vars = {}) {
  return String(template ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const value = vars[key]
    return value == null ? '' : String(value)
  })
}

/**
 * @param {Record<string, unknown> | null | undefined} override
 * @param {Record<string, string | null | undefined>} vars
 */
export function resolveEmailTemplateOverride(override, vars = {}) {
  if (!override || typeof override !== 'object') return null
  const subject = override.subject != null ? interpolateEmailTemplate(String(override.subject), vars) : null
  const eyebrow = override.eyebrow != null ? interpolateEmailTemplate(String(override.eyebrow), vars) : null
  const headline = override.headline != null ? interpolateEmailTemplate(String(override.headline), vars) : null
  const lead = override.lead != null ? interpolateEmailTemplate(String(override.lead), vars) : null
  const noteTitle = override.noteTitle != null ? interpolateEmailTemplate(String(override.noteTitle), vars) : null
  const noteBody = override.noteBody != null ? interpolateEmailTemplate(String(override.noteBody), vars) : null
  const primaryActionLabel = override.primaryActionLabel != null
    ? interpolateEmailTemplate(String(override.primaryActionLabel), vars)
    : null
  return {
    subject: subject?.trim() || null,
    eyebrow: eyebrow?.trim() || null,
    headline: headline?.trim() || null,
    lead: lead?.trim() || null,
    noteTitle: noteTitle?.trim() || null,
    noteBody: noteBody?.trim() || null,
    primaryActionLabel: primaryActionLabel?.trim() || null,
  }
}

/**
 * Apply override fields onto a buildStyledEmail options object (mutates a shallow copy).
 *
 * @param {Record<string, any>} opts
 * @param {Record<string, unknown> | null | undefined} override
 * @param {Record<string, string | null | undefined>} vars
 */
export function applyEmailTemplateOverride(opts, override, vars = {}) {
  const resolved = resolveEmailTemplateOverride(override, vars)
  if (!resolved) return opts

  const next = { ...opts }
  if (resolved.subject) next.subject = resolved.subject
  if (resolved.eyebrow) next.eyebrow = resolved.eyebrow
  if (resolved.headline) next.headline = resolved.headline
  if (resolved.lead) next.lead = resolved.lead

  if (resolved.noteTitle || resolved.noteBody) {
    const existing = opts.note && typeof opts.note === 'object' ? opts.note : {}
    const title = resolved.noteTitle || existing.title || ''
    const body = resolved.noteBody || existing.body || ''
    if (title || body) {
      next.note = { title, body }
    }
  }

  if (resolved.primaryActionLabel && opts.primaryAction?.href) {
    next.primaryAction = {
      ...opts.primaryAction,
      label: resolved.primaryActionLabel,
    }
  }

  return next
}

/**
 * Load active template content for a type key from a pg Pool (worker-friendly).
 *
 * @param {import('pg').Pool | null | undefined} pool
 * @param {string} typeKey
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function loadActiveEmailTemplateContent(pool, typeKey) {
  if (!pool || !typeKey) return null
  try {
    const result = await pool.query(
      `SELECT content FROM email_templates WHERE type_key = $1 AND is_active = true LIMIT 1`,
      [typeKey],
    )
    const content = result.rows?.[0]?.content
    return content && typeof content === 'object' ? content : null
  }
  catch {
    return null
  }
}
