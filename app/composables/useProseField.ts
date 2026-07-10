import type { ProseFieldMode } from '#shared/format/prose-field'
import {
  adjustCursorAfterFormat,
  autocapitalizeForMode,
  formatFieldText,
  formatLiveFieldText,
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

function applyElementAttrs(el: ProseElement, mode: ProseFieldMode) {
  el.autocapitalize = autocapitalizeForMode(mode)
  el.spellcheck = spellcheckForMode(mode)
}

function applyLiveFormatToElement(el: ProseElement, mode: ProseFieldMode) {
  if (mode === 'none' || mode === 'address') return
  const oldVal = el.value
  const pos = el.selectionStart ?? oldVal.length
  const formatted = formatLiveFieldText(oldVal, mode)
  if (formatted === oldVal) return
  el.value = formatted
  el.dispatchEvent(new Event('input', { bubbles: true }))
  const nextPos = adjustCursorAfterFormat(oldVal, formatted, pos)
  el.setSelectionRange(nextPos, nextPos)
}

export function bindProseField(el: ProseElement, mode: ProseFieldMode) {
  if (mode === 'none') return () => {}

  const onInput = () => {
    applyLiveFormatToElement(el, mode)
  }

  const onBlur = () => {
    const formatted = formatFieldText(el.value, mode)
    if (formatted !== el.value) {
      el.value = formatted
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  el.addEventListener('input', onInput)
  el.addEventListener('blur', onBlur)

  applyElementAttrs(el, mode)

  return () => {
    el.removeEventListener('input', onInput)
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
  function onInput(event: Event) {
    const el = event.target as ProseElement
    const oldVal = el.value
    const pos = el.selectionStart ?? oldVal.length
    const formatted = formatLiveFieldText(oldVal, mode)
    if (formatted !== oldVal) {
      el.value = formatted
      const nextPos = adjustCursorAfterFormat(oldVal, formatted, pos)
      el.setSelectionRange(nextPos, nextPos)
    }
    model.value = el.value
  }

  function onBlur() {
    model.value = formatFieldText(model.value, mode)
  }

  function applyVoiceText(spoken: string) {
    model.value = formatFieldText(spoken, mode)
  }

  const inputAttrs = computed(() => ({
    autocapitalize: autocapitalizeForMode(mode),
    spellcheck: spellcheckForMode(mode),
  }))

  return {
    inputAttrs,
    onInput,
    onBlur,
    applyVoiceText,
  }
}
