// Mobile wizard/form speech synthesis (TripBuddy-style gesture unlock + consent).

const CONSENT_KEY = 'dorincWizardSpeechEnabled'

let gestureEvaluated = false
/** On touch-primary devices, false until unlockSpeechFromUserGesture runs in a click handler. */
let gestureUnlocked = true

export function isMobileSpeechTarget(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(max-width: 720px)').matches) return true
    return (
      window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(hover: none)').matches
    )
  } catch {
    return false
  }
}

export function prefersReducedSpeech(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function isSpeechConsentEnabled(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  return window.localStorage.getItem(CONSENT_KEY) === 'true'
}

export function setSpeechConsentEnabled(enabled: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  window.localStorage.setItem(CONSENT_KEY, enabled ? 'true' : 'false')
}

/** Call synchronously from a create-button click before navigating to a wizard form. */
export function armWizardSpeechFromCreateClick(): void {
  setSpeechConsentEnabled(true)
  unlockSpeechFromUserGesture({ silent: true })
}

function evaluateGestureGate(): void {
  if (gestureEvaluated || typeof window === 'undefined') return
  gestureEvaluated = true
  if (likelyNeedsUserGesture()) gestureUnlocked = false
}

function likelyNeedsUserGesture(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      window.matchMedia('(pointer: coarse)').matches
      || window.matchMedia('(hover: none)').matches
    )
  } catch {
    return false
  }
}

export function isSpeechGestureUnlocked(): boolean {
  if (typeof window === 'undefined') return true
  evaluateGestureGate()
  return gestureUnlocked
}

/** Minimal in-gesture speak for iOS — unlocks speech without a long audible phrase. */
function primeSpeechSynthesisFromGesture(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance('\u200b')
    u.volume = 0.01
    u.rate = 2
    window.speechSynthesis.speak(u)
  }
  catch {
    /* ignore */
  }
}

/**
 * Call synchronously from a click / pointer handler so speech can play on iOS / Android.
 */
export function unlockSpeechFromUserGesture(opts: { silent?: boolean } = {}): void {
  if (typeof window === 'undefined') return
  const wasUnlocked = gestureUnlocked
  gestureUnlocked = true
  if (opts.silent) {
    if (!wasUnlocked) primeSpeechSynthesisFromGesture()
  }
}

export function tokenizeSpeechWords(text: string): string[] {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

export function wordIndexFromCharIndex(text: string, charIndex: number): number {
  const body = String(text || '')
  const words = tokenizeSpeechWords(body)
  if (!words.length || charIndex < 0) return -1
  let pos = 0
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    const idx = body.indexOf(w, pos)
    if (idx < 0) continue
    const end = idx + w.length
    if (charIndex >= idx && charIndex <= end) return i
    pos = end
  }
  const ratio = charIndex / Math.max(1, body.length)
  return Math.min(words.length - 1, Math.floor(ratio * words.length))
}

function toSpeechPhrase(text: string): string {
  return String(text)
    .replace(/·/g, ', ')
    .replace(/&amp;/g, 'and')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface SpeechSubtitleHandlers {
  onStart: (text: string) => void
  onWord: (index: number) => void
  onEnd: () => void
}

export function cancelSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

export function speakWizardText(
  text: string,
  handlers: SpeechSubtitleHandlers,
  opts: { fromGesture?: boolean, skipConsentCheck?: boolean } = {},
): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (prefersReducedSpeech()) return
  if (!opts.skipConsentCheck && !opts.fromGesture && !isSpeechConsentEnabled()) return

  evaluateGestureGate()
  if (!gestureUnlocked && !opts.fromGesture) return

  const spoken = toSpeechPhrase(text)
  if (!spoken) return

  cancelSpeech()
  handlers.onStart(spoken)

  const u = new SpeechSynthesisUtterance(spoken)
  u.rate = 1.05
  u.pitch = 1
  u.volume = 1

  u.onboundary = (e) => {
    if (e.name !== 'word' || e.charIndex == null) return
    const idx = wordIndexFromCharIndex(spoken, e.charIndex)
    if (idx >= 0) handlers.onWord(idx)
  }

  const finish = () => {
    handlers.onEnd()
  }

  u.onend = finish
  u.onerror = finish

  window.speechSynthesis.speak(u)
}
