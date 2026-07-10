import {
  cancelSpeech,
  isMobileSpeechTarget,
  isSpeechConsentEnabled,
  speakWizardText,
  unlockSpeechFromUserGesture,
} from '~/utils/wizard-speech'

export interface FormSpeechSection {
  selector: string
  narration: string
}

/** Step-based wizard narration (service log, invoice). */
export function useWizardStepNarration(
  step: Ref<number>,
  narrations: Record<number, string>,
) {
  const enabled = ref(isSpeechConsentEnabled())

  function narrateCurrentStep() {
    if (!enabled.value || !isMobileSpeechTarget()) return
    const text = narrations[step.value]
    if (text) speakWizardText(text, { fromGesture: true })
  }

  function autoStartIfConsented() {
    if (!isMobileSpeechTarget() || !isSpeechConsentEnabled()) return
    enabled.value = true
    unlockSpeechFromUserGesture({ silent: true })
    nextTick(() => narrateCurrentStep())
  }

  watch(step, () => {
    if (enabled.value) narrateCurrentStep()
  })

  onMounted(() => {
    autoStartIfConsented()
  })

  onBeforeUnmount(() => {
    cancelSpeech()
  })

  return {
    narrateCurrentStep,
  }
}

/** Single-page form section narration via IntersectionObserver. */
export function useFormSectionSpeech(
  root: Ref<HTMLElement | null | undefined>,
  sections: FormSpeechSection[],
) {
  const enabled = ref(isSpeechConsentEnabled())
  let observer: IntersectionObserver | null = null
  let activeKey = ''

  function narrateSection(key: string, text: string) {
    if (!enabled.value || !isMobileSpeechTarget()) return
    activeKey = key
    speakWizardText(text, { fromGesture: true })
  }

  function autoStartIfConsented() {
    if (!isMobileSpeechTarget() || !isSpeechConsentEnabled()) return
    enabled.value = true
    unlockSpeechFromUserGesture({ silent: true })
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

  onMounted(() => {
    autoStartIfConsented()
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    cancelSpeech()
  })
}
