// Single-utterance speech capture for conversational prompts.

interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  0: { transcript: string }
  [index: number]: { transcript: string }
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultLike[]
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechAnswerSupported(): boolean {
  return !!getSpeechRecognitionCtor()
}

function collectAlternatives(event: SpeechRecognitionEventLike): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i]
    if (!result?.isFinal) continue
    for (let j = 0; j < result.length; j++) {
      const text = result[j]?.transcript?.trim()
      if (!text) continue
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(text)
    }
  }
  return out
}

/** Listen for one spoken answer and return ranked transcript alternatives. */
export function listenOnceWithAlternatives(timeoutMs = 12000): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      reject(new Error('unsupported'))
      return
    }

    const recognition = new Ctor()
    let settled = false
    let alternatives: string[] = []

    const finish = (texts: string[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { recognition.stop() } catch { /* ignore */ }
      resolve(texts)
    }

    const fail = (msg: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { recognition.abort() } catch { /* ignore */ }
      reject(new Error(msg))
    }

    const timer = setTimeout(() => {
      if (alternatives.length) finish(alternatives)
      else fail('no-speech')
    }, timeoutMs)

    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 5
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      const next = collectAlternatives(event)
      if (next.length) alternatives = next
    }

    recognition.onerror = (e) => {
      if (e.error === 'aborted') return
      if (e.error === 'no-speech' && alternatives.length) {
        finish(alternatives)
        return
      }
      fail(e.error === 'no-speech' ? 'no-speech' : 'capture-failed')
    }

    recognition.onend = () => {
      if (!settled) {
        if (alternatives.length) finish(alternatives)
        else fail('no-speech')
      }
    }

    try {
      recognition.start()
    }
    catch {
      fail('start-failed')
    }
  })
}

/** Listen for one spoken answer, then resolve the best transcript. */
export function listenOnce(timeoutMs = 12000): Promise<string> {
  return listenOnceWithAlternatives(timeoutMs).then(alts => alts[0] ?? '')
}
