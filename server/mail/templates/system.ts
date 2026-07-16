/** TypeScript facade for shared system email templates (.mjs). */
export {
  buildSignupVerificationEmail,
  buildPasswordResetEmail,
  buildSmtpTestEmail,
  buildPortalCredentialEmail,
  buildBackupNotificationEmail,
  buildInvoiceAttachedEmail,
  buildLoginNotificationEmail,
  buildDeletionRequestSubmittedEmail,
  buildDeletionRequestResultEmail,
  buildUserSignupPendingEmail,
  buildInvoicePendingApprovalEmail,
  buildCustomerServiceRequestStaffEmail,
  buildCustomerChangeRequestStaffEmail,
  buildCustomerEmailReceivedStaffEmail,
} from './system.mjs'
