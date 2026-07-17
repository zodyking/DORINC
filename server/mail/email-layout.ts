/**
 * TypeScript facade for the shared email layout (.mjs).
 * Keep styles in sync with email-styles.scss.
 */
export {
  EMAIL_BRAND_NAME,
  EMAIL_BRAND_LEGAL,
  EMAIL_TOKENS,
  escapeHtml,
  emailButton,
  emailBadge,
  emailPanel,
  emailParagraph,
  emailMuted,
  emailEyebrow,
  emailHighlight,
  emailDetails,
  emailNote,
  emailActions,
  emailSecondaryLink,
  normalizeEmailBrand,
  wrapEmailHtml,
  buildStyledEmail,
} from './email-layout.mjs'
