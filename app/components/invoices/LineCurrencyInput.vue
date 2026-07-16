<script setup lang="ts">
import {
  appendCurrencyDigit,
  backspaceCurrency,
  normalizeCurrencyDisplay,
  parseCurrencyInput,
} from '~/utils/currency-field'

const model = defineModel<string>({ required: true })

const props = withDefaults(defineProps<{
  disabled?: boolean
  ariaLabel?: string
  lineId?: string
}>(), {
  disabled: false,
  ariaLabel: 'Rate',
  lineId: undefined,
})

const emit = defineEmits<{
  blur: []
  'tab-next': []
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const editing = ref(false)

const displayValue = computed(() => normalizeCurrencyDisplay(model.value))

function commit(value: string) {
  model.value = normalizeCurrencyDisplay(value)
}

function onFocus() {
  editing.value = true
  nextTick(() => {
    inputEl.value?.select()
  })
}

function onBlur() {
  editing.value = false
  commit(model.value)
  emit('blur')
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return

  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    commit(model.value)
    inputEl.value?.blur()
    emit('tab-next')
    return
  }

  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault()
    commit(appendCurrencyDigit(model.value, e.key))
    return
  }

  if (e.key === 'Backspace') {
    e.preventDefault()
    commit(backspaceCurrency(model.value))
    return
  }

  if (e.key === 'Delete') {
    e.preventDefault()
    commit('0.00')
  }
}

function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text') ?? ''
  commit(parseCurrencyInput(text))
}

function focus() {
  inputEl.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <input
    ref="inputEl"
    class="num line-currency-input"
    type="text"
    inputmode="numeric"
    autocomplete="off"
    :value="displayValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    :data-line-id="lineId"
    data-line-field="rate"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
    @paste="onPaste"
  >
</template>
