// Mobile wizard/form speech synthesis (TripBuddy-style gesture unlock + consent).

const CONSENT_KEY = 'dorincWizardSpeechEnabled'

let gestureEvaluated = false
/** On touch-primary devices, false until unlockSpeechFromUserGesture runs in a click handler. */
let gestureUnlocked = true
/** Set when the user explicitly unlocks speech from a tap (create button, mic orb, etc.). */
let gestureExplicitlyUnlocked = false
/** Timestamp of the most recent gesture unlock — used to defer the first post-nav speak. */
let speechArmedAt = 0

let voicesReady: Promise<void> | null = null

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
  unlockSpeechFromUserGesture({ forcePrime: true })
}

function evaluateGestureGate(): void {
  if (gestureEvaluated || typeof window === 'undefined') return
  gestureEvaluated = true
  if (likelyNeedsUserGesture() && !gestureExplicitlyUnlocked) {
    gestureUnlocked = false
  }
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

function isWithinSpeechArmWindow(): boolean {
  return speechArmedAt > 0 && Date.now() - speechArmedAt < 5000
}

export function isSpeechGestureUnlocked(): boolean {
  if (typeof window === 'undefined') return true
  evaluateGestureGate()
  return gestureUnlocked || isWithinSpeechArmWindow()
}

/** Minimal in-gesture speak for iOS — unlocks speech without a long audible phrase. */
function primeSpeechSynthesisFromGesture(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  try {
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
export function unlockSpeechFromUserGesture(opts: { silent?: boolean, forcePrime?: boolean } = {}): void {
  if (typeof window === 'undefined') return
  const wasUnlocked = gestureUnlocked
  gestureExplicitlyUnlocked = true
  gestureUnlocked = true
  speechArmedAt = Date.now()
  if (opts.forcePrime || (opts.silent && !wasUnlocked)) {
    primeSpeechSynthesisFromGesture()
  }
}

function ensureVoicesReady(): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve()
  if (voicesReady) return voicesReady
  voicesReady = new Promise((resolve) => {
    const synth = window.speechSynthesis
    const finish = () => resolve()
    if (synth.getVoices().length > 0) {
      finish()
      return
    }
    synth.addEventListener('voiceschanged', finish, { once: true })
    window.setTimeout(finish, 600)
  })
  return voicesReady
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

function delayBeforeSpeakMs(): number {
  if (!speechArmedAt) return 0
  const elapsed = Date.now() - speechArmedAt
  if (elapsed > 2000) return 0
  return Math.max(80, 280 - elapsed)
}

function speakNow(spoken: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  cancelSpeech()
  const u = new SpeechSynthesisUtterance(spoken)
  u.rate = 1.05
  u.pitch = 1
  u.volume = 1
  const finish = () => onEnd?.()
  u.onend = finish
  u.onerror = finish
  window.speechSynthesis.speak(u)
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
  const gestureOk = gestureUnlocked || opts.fromGesture || isWithinSpeechArmWindow()
  if (!gestureOk) {
    opts.onEnd?.()
    return
  }

  const spoken = toSpeechPhrase(text)
  if (!spoken) {
    opts.onEnd?.()
    return
  }

  const delay = delayBeforeSpeakMs()
  void ensureVoicesReady().then(() => {
    if (delay > 0) {
      window.setTimeout(() => speakNow(spoken, opts.onEnd), delay)
    }
    else {
      speakNow(spoken, opts.onEnd)
    }
  })
}

/** Run the first wizard narration after mount (post-nav iOS needs a short settle). */
export function scheduleInitialWizardSpeech(speak: () => void): void {
  if (typeof window === 'undefined') return
  if (!isMobileSpeechTarget() || !isSpeechConsentEnabled()) return
  const delay = Math.max(80, delayBeforeSpeakMs())
  window.setTimeout(() => {
    void ensureVoicesReady().then(speak)
  }, delay)
}
