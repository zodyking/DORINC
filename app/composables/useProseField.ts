import type { ProseFieldMode } from '#shared/format/prose-field'
import {
  applyLiveTitleCase,
  autocapitalizeForMode,
  formatFieldText,
  spellcheckForMode,
} from '#shared/format/prose-field'

export function parseProseFieldMode(value: unknown): ProseFieldMode {
  if (typeof value === 'string') return value as ProseFieldMode
  if (value && typeof value === 'object' && 'mode' in value) {
    return (value as { mode: ProseFieldMode }).mode
  }
  return 'prose'
}

type ProseElement = HTMLInputElement | HTMLTextAreaElement

const SKIP_INPUT_TYPES = new Set([
  'email', 'password', 'number', 'date', 'tel', 'search', 'url', 'time', 'datetime-local',
])

function applyElementAttrs(el: ProseElement, mode: ProseFieldMode, spellcheckOn: boolean) {
  el.autocapitalize = autocapitalizeForMode(mode)
  el.spellcheck = spellcheckOn && spellcheckForMode(mode)
}

export function bindProseField(el: ProseElement, mode: ProseFieldMode) {
  if (mode === 'none') return () => {}

  let spellcheckOn = false

  const onInput = () => {
    if (mode === 'prose' || mode === 'name') {
      const pos = el.selectionStart ?? el.value.length
      const formatted = applyLiveTitleCase(el.value)
      if (formatted !== el.value) {
        el.value = formatted
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.setSelectionRange(pos, pos)
      }
    }
  }

  const onFocus = () => {
    spellcheckOn = false
    applyElementAttrs(el, mode, false)
  }

  const onBlur = () => {
    const formatted = formatFieldText(el.value, mode)
    if (formatted !== el.value) {
      el.value = formatted
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    spellcheckOn = true
    applyElementAttrs(el, mode, true)
  }

  el.addEventListener('input', onInput)
  el.addEventListener('focus', onFocus)
  el.addEventListener('blur', onBlur)

  applyElementAttrs(el, mode, false)

  return () => {
    el.removeEventListener('input', onInput)
    el.removeEventListener('focus', onFocus)
    el.removeEventListener('blur', onBlur)
  }
}

function resolveMode(el: ProseElement): ProseFieldMode | null {
  const explicit = el.dataset.prose as ProseFieldMode | undefined
  if (explicit) return explicit

  if (el.classList.contains('no-prose') || el.closest('.no-prose')) return null
  if (el.classList.contains('mono') || el.closest('.mono')) return null

  const scope = el.closest('[data-prose-scope]')?.getAttribute('data-prose-scope') as ProseFieldMode | null
  if (scope) return scope

  if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) return null

  return 'prose'
}

function shouldBind(el: Element): el is ProseElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false
  if (el instanceof HTMLInputElement && !['text', ''].includes(el.type)) return false
  if ((el as HTMLElement & { dataset: { proseBound?: string } }).dataset.proseBound === '1') return false
  return resolveMode(el) !== null
}

export function bindProseFieldsIn(root: ParentNode = document) {
  const cleanups: Array<() => void> = []
  root.querySelectorAll(
    'label.fld input, label.fld textarea, .auth-body .fld input[type=text], [data-prose]',
  ).forEach((el) => {
    if (!shouldBind(el)) return
    const mode = resolveMode(el)!
    const cleanup = bindProseField(el, mode)
    el.dataset.proseBound = '1'
    cleanups.push(() => {
      cleanup()
      delete el.dataset.proseBound
    })
  })
  return () => cleanups.forEach(fn => fn())
}

export function useProseField(
  model: Ref<string>,
  mode: ProseFieldMode = 'prose',
) {
  const spellcheckActive = ref(false)

  function onInput(event: Event) {
    const el = event.target as ProseElement
    let val = el.value
    if (mode === 'prose' || mode === 'name') {
      const formatted = applyLiveTitleCase(val)
      if (formatted !== val) {
        const pos = el.selectionStart ?? formatted.length
        el.value = formatted
        val = formatted
        el.setSelectionRange(pos, pos)
      }
    }
    model.value = val
  }

  function onFocus() {
    spellcheckActive.value = false
  }

  function onBlur() {
    model.value = formatFieldText(model.value, mode)
    spellcheckActive.value = spellcheckForMode(mode)
  }

  function applyVoiceText(spoken: string) {
    model.value = formatFieldText(spoken, mode)
  }

  const inputAttrs = computed(() => ({
    autocapitalize: autocapitalizeForMode(mode),
    spellcheck: spellcheckActive.value && spellcheckForMode(mode),
  }))

  return {
    spellcheckActive,
    inputAttrs,
    onInput,
    onFocus,
    onBlur,
    applyVoiceText,
  }
}
