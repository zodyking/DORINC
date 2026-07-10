// Web Speech API dictation for mobile form fields.

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

export function useVoiceDictation(onFinalText: (text: string) => void) {
  const listening = ref(false)
  const supported = ref(false)
  const error = ref('')

  let recognition: SpeechRecognitionLike | null = null

  onMounted(() => {
    supported.value = !!getSpeechRecognitionCtor()
  })

  function stop() {
    recognition?.stop()
    recognition = null
    listening.value = false
  }

  function start() {
    error.value = ''
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      error.value = 'Voice input is not supported on this browser.'
      return
    }

    stop()

    recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let chunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result?.isFinal) chunk += result[0].transcript
      }
      const text = chunk.trim()
      if (text) onFinalText(text)
    }

    recognition.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        error.value = 'Could not capture voice. Try again.'
      }
      stop()
    }

    recognition.onend = () => {
      listening.value = false
      recognition = null
    }

    try {
      recognition.start()
      listening.value = true
    }
    catch {
      error.value = 'Could not start microphone.'
      stop()
    }
  }

  function toggle() {
    if (listening.value) stop()
    else start()
  }

  onBeforeUnmount(() => {
    recognition?.abort()
    recognition = null
  })

  return {
    listening: readonly(listening),
    supported: readonly(supported),
    error: readonly(error),
    start,
    stop,
    toggle,
  }
}
