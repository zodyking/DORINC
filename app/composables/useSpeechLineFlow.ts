import { cancelSpeech, speakWizardText } from '~/utils/wizard-speech'
import { listenOnce, isSpeechAnswerSupported } from '~/composables/useSpeechAnswer'
import {
  buildLineFromDraft,
  fieldLabel,
  parseKeepCurrent,
  parseSpokenAddLineCommand,
  parseSpokenCancel,
  parseSpokenConfirm,
  parseSpokenEditField,
  parseSpokenEditLineNumber,
  parseSpokenLineType,
  parseSpokenNumber,
  promptForCommandMode,
  promptForEditField,
  promptForEditPick,
  promptForSpeechField,
  retryPromptForCommandMode,
  retryPromptForEditPick,
  retryPromptForField,
  type SpeechLineField,
} from '~/utils/speech-line-flow'
import { formatFieldText } from '#shared/format/prose-field'
import { emptyWizardLine, type WizardLineDraft } from '~/utils/line-item-wizard-ui'

export type SpeechFlowMode = 'command' | 'add' | 'edit'

export function useSpeechLineFlow(handlers: {
  onLineSaved: (line: WizardLineDraft, addAnother: boolean) => void
  onLineUpdated: (line: WizardLineDraft, index: number) => void
  lineCount: () => number
  getLine: (index: number) => WizardLineDraft | undefined
}) {
  const active = ref(false)
  const supported = ref(isSpeechAnswerSupported())
  const status = ref<'idle' | 'speaking' | 'listening' | 'processing'>('idle')
  const flowMode = ref<SpeechFlowMode>('add')
  const field = ref<SpeechLineField>('type')
  const prompt = ref('')
  const lastHeard = ref('')
  const error = ref('')
  const draft = ref(emptyWizardLine())
  const captured = ref<Partial<Record<SpeechLineField, string>>>({})
  const editingIndex = ref<number | null>(null)

  let aborted = false
  let listenGen = 0

  if (import.meta.client) {
    supported.value = isSpeechAnswerSupported()
  }

  function resetDraft() {
    draft.value = emptyWizardLine()
    captured.value = {}
    field.value = 'type'
    lastHeard.value = ''
    error.value = ''
    editingIndex.value = null
    flowMode.value = 'add'
  }

  function stop() {
    aborted = true
    listenGen += 1
    cancelSpeech()
    status.value = 'idle'
    active.value = false
    editingIndex.value = null
    flowMode.value = 'add'
  }

  function speakThenListen(text: string) {
    if (aborted) return
    status.value = 'speaking'
    prompt.value = text
    cancelSpeech()
    speakWizardText(text, {
      fromGesture: true,
      skipConsentCheck: true,
      onEnd: () => {
        if (aborted) return
        window.setTimeout(() => void beginListen(), 500)
      },
    })
  }

  async function beginListen() {
    if (aborted) return
    if (!supported.value) {
      error.value = 'Microphone is not available in this browser.'
      status.value = 'idle'
      return
    }
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
        error.value = 'Did not catch that. Trying again…'
        speakThenListen(retryPromptForCurrentField())
        return
      }
      error.value = 'Voice capture failed. Tap the mic to try again.'
      status.value = 'idle'
    }
  }

  function startAddFlow() {
    flowMode.value = 'add'
    editingIndex.value = null
    draft.value = emptyWizardLine()
    captured.value = {}
    field.value = 'type'
    error.value = ''
    prompt.value = promptForSpeechField('type', '')
    speakThenListen(promptForSpeechField('type', ''))
  }

  function startCommandFlow() {
    flowMode.value = 'command'
    editingIndex.value = null
    field.value = 'command'
    error.value = ''
    const text = promptForCommandMode(handlers.lineCount())
    prompt.value = text
    speakThenListen(text)
  }

  function cancelEditFlow() {
    editingIndex.value = null
    draft.value = emptyWizardLine()
    captured.value = {}
    error.value = ''
    startCommandFlow()
  }

  function goToEditPick() {
    if (editingIndex.value === null) {
      startCommandFlow()
      return
    }
    field.value = 'pick'
    const text = promptForEditPick(draft.value, editingIndex.value)
    prompt.value = text
    speakThenListen(text)
  }

  function goToEditField(target: Exclude<SpeechLineField, 'command' | 'pick' | 'confirm'>) {
    if (editingIndex.value === null) return
    field.value = target
    const text = promptForEditField(target, draft.value, editingIndex.value)
    prompt.value = text
    speakThenListen(text)
  }

  function saveEditedLine(andContinue: boolean) {
    if (editingIndex.value === null) return
    const line = buildLineFromDraft(draft.value)
    if (!line) {
      startCommandFlow()
      return
    }
    handlers.onLineUpdated(line, editingIndex.value)
    editingIndex.value = null
    draft.value = emptyWizardLine()
    captured.value = {}
    if (andContinue) {
      if (handlers.lineCount() > 0) startCommandFlow()
      else startAddFlow()
    }
    else {
      active.value = false
      stop()
    }
  }

  function startEditFlow(index: number) {
    const line = handlers.getLine(index)
    if (!line) {
      error.value = `Line ${index + 1} was not found.`
      startCommandFlow()
      return
    }
    flowMode.value = 'edit'
    editingIndex.value = index
    draft.value = { ...line }
    captured.value = {
      type: line.lineType,
      description: line.description,
      qty: line.qty,
      rate: line.rate,
    }
    field.value = 'pick'
    error.value = ''
    const text = promptForEditPick(draft.value, index)
    prompt.value = text
    speakThenListen(text)
  }

  function promptForCurrentField(): string {
    if (flowMode.value === 'edit' && editingIndex.value !== null) {
      if (field.value === 'pick') return promptForEditPick(draft.value, editingIndex.value)
      return promptForEditField(field.value, draft.value, editingIndex.value)
    }
    return promptForSpeechField(field.value, draft.value.lineType)
  }

  function retryPromptForCurrentField(): string {
    if (field.value === 'command') return retryPromptForCommandMode()
    if (flowMode.value === 'edit' && editingIndex.value !== null) {
      if (field.value === 'pick') return retryPromptForEditPick()
      return promptForEditField(field.value, draft.value, editingIndex.value)
    }
    return retryPromptForField(field.value)
  }

  function tryEditFieldJump(spoken: string): boolean {
    const target = parseSpokenEditField(spoken)
    if (!target || target === 'confirm') return false
    goToEditField(target)
    return true
  }

  async function handleEditPick(spoken: string) {
    if (parseSpokenCancel(spoken)) {
      cancelEditFlow()
      return
    }
    if (parseSpokenConfirm(spoken) === 'save' || parseSpokenEditField(spoken) === 'confirm') {
      saveEditedLine(false)
      return
    }
    const target = parseSpokenEditField(spoken)
    if (target && target !== 'confirm') {
      goToEditField(target)
      return
    }
    error.value = 'Say type, description, quantity, rate, save, or cancel.'
    speakThenListen(retryPromptForEditPick())
  }

  async function handleAnswer(spoken: string) {
    if (aborted) return
    status.value = 'processing'
    lastHeard.value = spoken
    error.value = ''

    if (field.value === 'command') {
      if (parseSpokenAddLineCommand(spoken)) {
        startAddFlow()
        return
      }
      const editIndex = parseSpokenEditLineNumber(spoken, handlers.lineCount())
      if (editIndex !== null) {
        startEditFlow(editIndex)
        return
      }
      error.value = 'Say add line, or edit line item number.'
      speakThenListen(retryPromptForCommandMode())
      return
    }

    if (flowMode.value === 'edit') {
      if (field.value === 'pick') {
        await handleEditPick(spoken)
        return
      }

      if (parseSpokenCancel(spoken)) {
        cancelEditFlow()
        return
      }

      if (tryEditFieldJump(spoken)) return

      if (field.value === 'confirm') {
        const action = parseSpokenConfirm(spoken)
        if (action === 'save') {
          saveEditedLine(false)
          return
        }
        speakThenListen(retryPromptForCurrentField())
        return
      }
    }

    const f = field.value
    const isEdit = flowMode.value === 'edit'

    if (f === 'type') {
      const type = isEdit && parseKeepCurrent(spoken)
        ? draft.value.lineType as typeof draft.value.lineType
        : parseSpokenLineType(spoken)
      if (!type) {
        speakThenListen(retryPromptForCurrentField())
        return
      }
      draft.value.lineType = type
      captured.value = { ...captured.value, type }
      if (isEdit) {
        goToEditPick()
        return
      }
      field.value = 'description'
      speakThenListen(promptForSpeechField('description', type))
      return
    }

    if (f === 'description') {
      const desc = isEdit && parseKeepCurrent(spoken)
        ? draft.value.description
        : formatFieldText(spoken.trim(), 'prose')
      if (!desc) {
        speakThenListen(retryPromptForCurrentField())
        return
      }
      draft.value.description = desc
      captured.value = { ...captured.value, description: desc }
      if (isEdit) {
        goToEditPick()
        return
      }
      field.value = 'qty'
      speakThenListen(promptForSpeechField('qty', draft.value.lineType))
      return
    }

    if (f === 'qty') {
      const qty = isEdit && parseKeepCurrent(spoken)
        ? draft.value.qty
        : parseSpokenNumber(spoken)
      if (!qty || Number.parseFloat(qty) <= 0) {
        speakThenListen(retryPromptForCurrentField())
        return
      }
      draft.value.qty = qty
      captured.value = { ...captured.value, qty }
      if (isEdit) {
        goToEditPick()
        return
      }
      field.value = 'rate'
      speakThenListen(promptForSpeechField('rate', draft.value.lineType))
      return
    }

    if (f === 'rate') {
      const rate = isEdit && parseKeepCurrent(spoken)
        ? draft.value.rate
        : parseSpokenNumber(spoken)
      if (!rate || Number.parseFloat(rate) < 0) {
        speakThenListen(retryPromptForCurrentField())
        return
      }
      draft.value.rate = rate
      captured.value = { ...captured.value, rate }
      if (isEdit) {
        goToEditPick()
        return
      }
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
        speakThenListen(retryPromptForCurrentField())
        return
      }
      const line = buildLineFromDraft(draft.value)
      if (!line) {
        if (handlers.lineCount() > 0) startCommandFlow()
        else startAddFlow()
        return
      }
      handlers.onLineSaved(line, action === 'another')
      if (action === 'another') {
        if (handlers.lineCount() > 0) startCommandFlow()
        else startAddFlow()
      }
      else {
        active.value = false
        stop()
      }
    }
  }

  function start() {
    supported.value = isSpeechAnswerSupported()
    aborted = false
    active.value = true
    resetDraft()
    unlockSpeechFromUserGesture({ silent: true })
    if (!supported.value) {
      prompt.value = 'Voice is not available here. Use the manual fields below.'
      status.value = 'idle'
      return
    }
    if (handlers.lineCount() > 0) startCommandFlow()
    else startAddFlow()
  }

  function retryListen() {
    if (aborted) return
    unlockSpeechFromUserGesture({ silent: true })
    if (!supported.value) {
      error.value = 'Voice is not available in this browser.'
      return
    }
    void beginListen()
  }

  onBeforeUnmount(() => stop())

  return {
    active,
    supported,
    status,
    flowMode,
    field,
    prompt,
    lastHeard,
    error,
    captured,
    editingIndex,
    fieldLabel: (f: SpeechLineField) => fieldLabel(f, draft.value.lineType),
    start,
    stop,
    retryListen,
  }
}
