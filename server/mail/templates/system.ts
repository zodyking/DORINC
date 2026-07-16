/** TypeScript facade for shared system email templates (.mjs). */
export {
  buildSignupVerificationEmail,
  buildPasswordResetEmail,
  buildSmtpTestEmail,
  buildPortalCredentialEmail,
  buildBackupNotificationEmail,
  buildInvoiceAttachedEmail,
  buildLoginNotificationEmail,
  buildCustomerAutoResponderEmail,
  buildDeletionRequestSubmittedEmail,
  buildDeletionRequestResultEmail,
  buildUserSignupPendingEmail,
  buildInvoicePendingApprovalEmail,
} from './system.mjs'
