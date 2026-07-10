import {
  cancelSpeech,
  isMobileSpeechTarget,
  isSpeechConsentEnabled,
  setSpeechConsentEnabled,
  speakWizardText,
  unlockSpeechFromUserGesture,
  type SpeechSubtitleHandlers,
} from '~/utils/wizard-speech'

export interface FormSpeechSection {
  selector: string
  narration: string
}

const subtitleText = ref('')
const subtitleWordIndex = ref(-1)
const subtitleOpen = ref(false)

function makeSubtitleHandlers(): SpeechSubtitleHandlers {
  return {
    onStart(text) {
      subtitleText.value = text
      subtitleWordIndex.value = -1
      subtitleOpen.value = true
    },
    onWord(index) {
      subtitleWordIndex.value = index
    },
    onEnd() {
      subtitleOpen.value = false
      subtitleWordIndex.value = -1
    },
  }
}

export function useSpeechSubtitle() {
  return {
    subtitleText: readonly(subtitleText),
    subtitleWordIndex: readonly(subtitleWordIndex),
    subtitleOpen: readonly(subtitleOpen),
  }
}

/** Step-based wizard narration (service log, invoice). */
export function useWizardStepNarration(
  step: Ref<number>,
  narrations: Record<number, string>,
) {
  const enabled = ref(isSpeechConsentEnabled())
  const showControl = computed(() => import.meta.client && isMobileSpeechTarget())
  const handlers = makeSubtitleHandlers()

  function narrateCurrentStep() {
    if (!enabled.value || !isMobileSpeechTarget()) return
    const text = narrations[step.value]
    if (text) speakWizardText(text, handlers)
  }

  function enableFromGesture() {
    setSpeechConsentEnabled(true)
    enabled.value = true
    unlockSpeechFromUserGesture({ silent: true })
    narrateCurrentStep()
  }

  function disableSpeech() {
    setSpeechConsentEnabled(false)
    enabled.value = false
    cancelSpeech()
    handlers.onEnd()
  }

  watch(step, () => {
    if (enabled.value) narrateCurrentStep()
  })

  onMounted(() => {
    if (enabled.value) narrateCurrentStep()
  })

  onBeforeUnmount(() => {
    cancelSpeech()
    handlers.onEnd()
  })

  return {
    enabled,
    showControl,
    enableFromGesture,
    disableSpeech,
    narrateCurrentStep,
  }
}

/** Single-page form section narration via IntersectionObserver. */
export function useFormSectionSpeech(
  root: Ref<HTMLElement | null | undefined>,
  sections: FormSpeechSection[],
) {
  const enabled = ref(isSpeechConsentEnabled())
  const showControl = computed(() => import.meta.client && isMobileSpeechTarget())
  const handlers = makeSubtitleHandlers()
  let observer: IntersectionObserver | null = null
  let activeKey = ''

  function narrateSection(key: string, text: string) {
    if (!enabled.value || !isMobileSpeechTarget()) return
    activeKey = key
    speakWizardText(text, handlers)
  }

  function enableFromGesture() {
    setSpeechConsentEnabled(true)
    enabled.value = true
    unlockSpeechFromUserGesture({ silent: true })
    const first = sections[0]
    if (first) narrateSection(first.selector, first.narration)
  }

  function disableSpeech() {
    setSpeechConsentEnabled(false)
    enabled.value = false
    cancelSpeech()
    handlers.onEnd()
    activeKey = ''
  }

  function setupObserver() {
    observer?.disconnect()
    observer = null
    const el = root.value
    if (!el || !enabled.value) return

    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting && e.intersectionRatio >= 0.45)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (!visible.length) return
        const hit = visible[0]!
        const key = sections.find(s => hit.target.matches(s.selector))?.selector ?? ''
        if (!key || key === activeKey) return
        const section = sections.find(s => s.selector === key)
        if (!section) return
        narrateSection(key, section.narration)
      },
      { root: null, threshold: [0.45, 0.6, 0.75] },
    )

    for (const s of sections) {
      const node = el.querySelector(s.selector)
      if (node) observer.observe(node)
    }
  }

  watch([enabled, root], () => {
    if (enabled.value) {
      nextTick(() => {
        setupObserver()
        if (sections[0] && !activeKey) {
          narrateSection(sections[0].selector, sections[0].narration)
        }
      })
    }
    else observer?.disconnect()
  }, { immediate: true })

  onBeforeUnmount(() => {
    observer?.disconnect()
    cancelSpeech()
    handlers.onEnd()
  })

  return {
    enabled,
    showControl,
    enableFromGesture,
    disableSpeech,
  }
}
