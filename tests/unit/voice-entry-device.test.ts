import { describe, expect, it } from 'vitest'
import { isVoiceEntryUserAgent } from '../../shared/voice-entry-device'

describe('isVoiceEntryUserAgent', () => {
  it('allows iPhone and iPad', () => {
    expect(isVoiceEntryUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
    expect(isVoiceEntryUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true)
  })

  it('blocks desktop and Android browsers', () => {
    expect(isVoiceEntryUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false)
    expect(isVoiceEntryUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
    expect(isVoiceEntryUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(false)
  })
})
