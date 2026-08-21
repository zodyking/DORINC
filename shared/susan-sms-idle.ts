/** Re-export Susan SMS idle-timeout helpers for TypeScript consumers. */
export {
  SUSAN_SMS_IDLE_MS,
  SUSAN_SMS_IDLE_SECONDS,
  SUSAN_SMS_HISTORY_LIMIT,
  susanSmsIdleThreadPatch,
  topicForSusanSmsIdle,
  formatSusanSmsIdleTimeoutMessage,
  lastSusanSmsUserText,
} from './susan-sms-idle.mjs'
