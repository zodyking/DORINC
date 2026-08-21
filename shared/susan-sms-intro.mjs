/**
 * Periodic Susan SMS how-to — sent to staff on Text notifications.
 * At most once every 72 hours, and not while they have been texting her.
 */

export const SUSAN_SMS_INTRO_MS = 72 * 60 * 60 * 1000
export const SUSAN_SMS_INTRO_SECONDS = 72 * 60 * 60
/** Don't stack this ping on a timeout SMS that just went out. */
export const SUSAN_SMS_INTRO_AFTER_IDLE_SECONDS = 15 * 60

export function formatSusanSmsIntroMessage() {
  return [
    `Hey — I'm Susan, your AI assistant.`,
    '',
    'You can chat with me here or in the app for your DORINC Suite needs.',
    '',
    'Just ask me anything, or text Menu for commands.',
  ].join('\n')
}

function toMs(value) {
  if (value == null || value === '') return null
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value))
  return Number.isFinite(ms) ? ms : null
}

/**
 * True when this staffer should get (or get again) the how-to SMS.
 * Skips anyone who texted in the last 72 hours, and never sends more than
 * once per 72 hours.
 *
 * @param {{
 *   lastUserAt?: Date | string | null,
 *   lastIntroAt?: Date | string | null,
 *   idleClosedAt?: Date | string | null,
 *   optedOutAt?: Date | string | null,
 * }} input
 * @param {Date} [now]
 */
export function isSusanSmsIntroDue(input, now = new Date()) {
  const lastUser = toMs(input?.lastUserAt ?? input?.last_user_at)
  const lastIntro = toMs(input?.lastIntroAt ?? input?.last_intro_at)
  const idleClosed = toMs(input?.idleClosedAt ?? input?.idle_closed_at)
  const optedOut = toMs(input?.optedOutAt ?? input?.opted_out_at)
  if (optedOut) return false
  const nowMs = now.getTime()

  if (lastUser != null && idleClosed == null && nowMs - lastUser < 5 * 60 * 1000) {
    return false
  }
  if (idleClosed != null && nowMs - idleClosed < SUSAN_SMS_INTRO_AFTER_IDLE_SECONDS * 1000) {
    return false
  }
  if (lastIntro != null && nowMs - lastIntro < SUSAN_SMS_INTRO_MS) return false
  if (lastUser != null && nowMs - lastUser < SUSAN_SMS_INTRO_MS) return false
  return true
}
