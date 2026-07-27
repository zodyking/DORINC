import { isVoiceEntryUserAgent } from '#shared/voice-entry-device'

export function isVoiceEntryDevice(): boolean {
  if (!import.meta.client) return false
  return isVoiceEntryUserAgent(navigator.userAgent)
}
