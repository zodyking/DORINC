/** iPhone / iPad / iPod — the only devices that get voice line entry. */
export function isVoiceEntryUserAgent(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent)
}
