/** TypeScript facade for shared system email templates (.mjs). */
export {
  buildSignupVerificationEmail,
  buildSmtpTestEmail,
  buildPortalCredentialEmail,
  buildBackupNotificationEmail,
  buildInvoiceAttachedEmail,
  buildLoginNotificationEmail,
  buildDeletionRequestSubmittedEmail,
  buildDeletionRequestResultEmail,
  buildUserSignupPendingEmail,
  buildInvoicePendingApprovalEmail,
} from './system.mjs'
