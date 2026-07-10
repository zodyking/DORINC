import { cancelSpeech, speakWizardText } from '~/utils/wizard-speech'
import { listenOnce, isSpeechAnswerSupported } from '~/composables/useSpeechAnswer'
import {
  buildLineFromDraft,
  fieldLabel,
  parseSpokenConfirm,
  parseSpokenLineType,
  parseSpokenNumber,
  promptForSpeechField,
  retryPromptForField,
  type SpeechLineField,
} from '~/utils/speech-line-flow'
import { emptyWizardLine, type WizardLineDraft } from '~/utils/line-item-wizard-ui'

export function useSpeechLineFlow(onLineSaved: (line: WizardLineDraft, addAnother: boolean) => void) {
  const active = ref(false)
  const supported = ref(false)
  const status = ref<'idle' | 'speaking' | 'listening' | 'processing'>('idle')
  const field = ref<SpeechLineField>('type')
  const prompt = ref('')
  const lastHeard = ref('')
  const error = ref('')
  const draft = ref(emptyWizardLine())
  const captured = ref<Partial<Record<SpeechLineField, string>>>({})

  let aborted = false
  let listenGen = 0

  onMounted(() => {
    supported.value = isSpeechAnswerSupported()
  })

  function resetDraft() {
    draft.value = emptyWizardLine()
    captured.value = {}
    field.value = 'type'
    lastHeard.value = ''
    error.value = ''
  }

  function stop() {
    aborted = true
    listenGen += 1
    cancelSpeech()
    status.value = 'idle'
    active.value = false
  }

  function speakThenListen(text: string) {
    if (aborted) return
    status.value = 'speaking'
    prompt.value = text
    cancelSpeech()
    speakWizardText(text, {
      fromGesture: true,
      onEnd: () => {
        if (aborted) return
        window.setTimeout(() => void beginListen(), 450)
      },
    })
  }

  async function beginListen() {
    if (aborted) return
    const gen = ++listenGen
    status.value = 'listening'
    try {
      const text = await listenOnce()
      if (aborted || gen !== listenGen) return
      await handleAnswer(text)
    }
    catch (e) {
      if (aborted || gen !== listenGen) return
      const code = (e as Error).message
      if (code === 'no-speech') {
        error.value = 'Did not catch that. Listening again…'
        speakThenListen(retryPromptForField(field.value))
        return
      }
      error.value = 'Voice capture failed. Tap the mic to try again.'
      status.value = 'idle'
    }
  }

  async function handleAnswer(spoken: string) {
    if (aborted) return
    status.value = 'processing'
    lastHeard.value = spoken
    error.value = ''

    const f = field.value

    if (f === 'type') {
      const type = parseSpokenLineType(spoken)
      if (!type) {
        speakThenListen(retryPromptForField('type'))
        return
      }
      draft.value.lineType = type
      captured.value.type = type
      field.value = 'description'
      speakThenListen(promptForSpeechField('description', type))
      return
    }

    if (f === 'description') {
      const desc = spoken.trim()
      if (!desc) {
        speakThenListen(retryPromptForField('description'))
        return
      }
      draft.value.description = desc
      captured.value.description = desc
      field.value = 'qty'
      speakThenListen(promptForSpeechField('qty', draft.value.lineType))
      return
    }

    if (f === 'qty') {
      const qty = parseSpokenNumber(spoken)
      if (!qty || Number.parseFloat(qty) <= 0) {
        speakThenListen(retryPromptForField('qty'))
        return
      }
      draft.value.qty = qty
      captured.value.qty = qty
      field.value = 'rate'
      speakThenListen(promptForSpeechField('rate', draft.value.lineType))
      return
    }

    if (f === 'rate') {
      const rate = parseSpokenNumber(spoken)
      if (!rate || Number.parseFloat(rate) < 0) {
        speakThenListen(retryPromptForField('rate'))
        return
      }
      draft.value.rate = rate
      captured.value.rate = rate
      field.value = 'confirm'
      const line = buildLineFromDraft(draft.value)
      const summary = line
        ? `${line.description}. ${line.qty} at ${line.rate}.`
        : ''
      speakThenListen(`${summary} ${promptForSpeechField('confirm', draft.value.lineType)}`)
      return
    }

    if (f === 'confirm') {
      const action = parseSpokenConfirm(spoken)
      if (!action) {
        speakThenListen(retryPromptForField('confirm'))
        return
      }
      const line = buildLineFromDraft(draft.value)
      if (!line) {
        resetDraft()
        start()
        return
      }
      onLineSaved(line, action === 'another')
      if (action === 'another') {
        resetDraft()
        start()
      }
      else {
        active.value = false
        stop()
      }
    }
  }

  function start() {
    if (!supported.value) return
    aborted = false
    active.value = true
    resetDraft()
    unlockSpeechFromUserGesture({ silent: true })
    speakThenListen(promptForSpeechField('type', ''))
  }

  function retryListen() {
    if (!supported.value || aborted) return
    unlockSpeechFromUserGesture({ silent: true })
    void beginListen()
  }

  onBeforeUnmount(() => stop())

  return {
    active: readonly(active),
    supported: readonly(supported),
    status: readonly(status),
    field: readonly(field),
    prompt: readonly(prompt),
    lastHeard: readonly(lastHeard),
    error: readonly(error),
    captured: readonly(captured),
    fieldLabel: (f: SpeechLineField) => fieldLabel(f, draft.value.lineType),
    start,
    stop,
    retryListen,
  }
}
