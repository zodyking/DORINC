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

function toSpeechPhrase(text: string): string {
  return String(text)
    .replace(/·/g, ', ')
    .replace(/&amp;/g, 'and')
    .replace(/\s+/g, ' ')
    .trim()
}

export function cancelSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

export function speakWizardText(
  text: string,
  opts: { fromGesture?: boolean, skipConsentCheck?: boolean, onEnd?: () => void } = {},
): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (prefersReducedSpeech()) {
    opts.onEnd?.()
    return
  }
  if (!opts.skipConsentCheck && !opts.fromGesture && !isSpeechConsentEnabled()) {
    opts.onEnd?.()
    return
  }

  evaluateGestureGate()
  if (!gestureUnlocked && !opts.fromGesture) {
    opts.onEnd?.()
    return
  }

  const spoken = toSpeechPhrase(text)
  if (!spoken) {
    opts.onEnd?.()
    return
  }

  cancelSpeech()

  const u = new SpeechSynthesisUtterance(spoken)
  u.rate = 1.05
  u.pitch = 1
  u.volume = 1

  const finish = () => {
    opts.onEnd?.()
  }

  u.onend = finish
  u.onerror = finish

  window.speechSynthesis.speak(u)
}
