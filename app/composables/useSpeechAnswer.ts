// Single-utterance speech capture for conversational prompts.

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: { transcript: string }
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: SpeechRecognitionResultLike[]
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
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

/** Listen for one spoken answer, then resolve. */
export function listenOnce(timeoutMs = 12000): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      reject(new Error('unsupported'))
      return
    }

    const recognition = new Ctor()
    let settled = false
    let transcript = ''

    const finish = (text: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { recognition.stop() } catch { /* ignore */ }
      resolve(text.trim())
    }

    const fail = (msg: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { recognition.abort() } catch { /* ignore */ }
      reject(new Error(msg))
    }

    const timer = setTimeout(() => {
      if (transcript.trim()) {
        finish(transcript)
      } else {
        fail('no-speech')
      }
    }, timeoutMs)

    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result?.isFinal) transcript += result[0].transcript
      }
    }

    recognition.onerror = (e) => {
      if (e.error === 'aborted') return
      if (e.error === 'no-speech' && transcript.trim()) {
        finish(transcript)
        return
      }
      fail(e.error === 'no-speech' ? 'no-speech' : 'capture-failed')
    }

    recognition.onend = () => {
      if (!settled) {
        if (transcript.trim()) {
          finish(transcript)
        } else {
          fail('no-speech')
        }
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
