<script setup lang="ts">
import { normalizeCurrencyDisplay } from '~/utils/currency-field'

const model = defineModel<string>({ required: true })

const props = withDefaults(defineProps<{
  disabled?: boolean
  ariaLabel?: string
}>(), {
  disabled: false,
  ariaLabel: 'Quantity',
})

const emit = defineEmits<{
  blur: []
  'tab-next': []
}>()

const inputEl = ref<HTMLInputElement | null>(null)

function sanitize(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const parts = cleaned.split('.')
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  model.value = sanitize(target.value)
}

function onBlur() {
  if (model.value.trim()) {
    model.value = normalizeCurrencyDisplay(model.value)
  }
  emit('blur')
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    onBlur()
    emit('tab-next')
  }
}

function focus() {
  inputEl.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <input
    ref="inputEl"
    class="num line-qty-input"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    :value="model"
    :disabled="disabled"
    :aria-label="ariaLabel"
    @input="onInput"
    @blur="onBlur"
    @keydown="onKeydown"
  >
</template>
