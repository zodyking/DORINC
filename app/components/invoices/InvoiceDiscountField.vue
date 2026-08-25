<script setup lang="ts">
import {
  formatPercentOffField,
  normalizePercentOff,
  percentOffFromAmount,
} from '#shared/invoice-discount'
import { parseMoney, percentOfMoney } from '#shared/money'
import LineCurrencyInput from '~/components/invoices/LineCurrencyInput.vue'

const amount = defineModel<string | null>('amount', { default: '0.00' })
const percent = defineModel<string | null>('percent', { default: null })

const amountValue = computed({
  get: () => amount.value || '0.00',
  set: (value: string) => { amount.value = value },
})

const props = withDefaults(defineProps<{
  disabled?: boolean
  dense?: boolean
  lineId?: string
  /** Gross amount used when switching $ → % (line total or invoice subtotal). */
  baseAmount?: string
  /** Inclusive invoice discount cannot go below line-item discounts. */
  minAmount?: string
  ariaLabel?: string
}>(), {
  disabled: false,
  dense: false,
  lineId: undefined,
  baseAmount: '0',
  minAmount: '0',
  ariaLabel: 'Discount',
})

const emit = defineEmits<{
  blur: []
  'tab-next': []
}>()

const mode = ref<'amount' | 'percent'>(normalizePercentOff(percent.value) ? 'percent' : 'amount')
const percentDraft = ref(percent.value ?? '')
const fieldEl = ref<HTMLElement | null>(null)
const amountInput = ref<{ focus: () => void } | null>(null)
const percentInput = ref<HTMLInputElement | null>(null)

watch(() => percent.value, (value) => {
  if (normalizePercentOff(value)) {
    mode.value = 'percent'
    percentDraft.value = value ?? ''
  }
}, { immediate: true })

function clampToMin() {
  const min = props.minAmount || '0'
  try {
    if (parseMoney(amount.value || '0') >= parseMoney(min)) return
  }
  catch {
    return
  }
  amount.value = min
  percent.value = null
  percentDraft.value = ''
  mode.value = 'amount'
}

function setMode(next: 'amount' | 'percent') {
  if (props.disabled || mode.value === next) return
  if (next === 'percent') {
    const fromAmount = percentOffFromAmount(props.baseAmount || '0', amount.value || '0')
    const nextPercent = fromAmount ?? formatPercentOffField(percent.value) ?? ''
    percentDraft.value = nextPercent
    percent.value = formatPercentOffField(nextPercent)
    if (percent.value && props.baseAmount) {
      amount.value = percentOfMoney(props.baseAmount, percent.value)
    }
    mode.value = 'percent'
    clampToMin()
    return
  }
  if (normalizePercentOff(percent.value) && props.baseAmount) {
    amount.value = percentOfMoney(props.baseAmount, percent.value!)
  }
  percent.value = null
  percentDraft.value = ''
  mode.value = 'amount'
  clampToMin()
}

function commitPercent() {
  const next = formatPercentOffField(percentDraft.value)
  percent.value = next
  percentDraft.value = next ?? ''
  if (next && props.baseAmount) {
    amount.value = percentOfMoney(props.baseAmount, next)
  }
  else if (!next) {
    amount.value = amount.value || '0.00'
  }
  clampToMin()
}

function onPercentInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.replace(/[^0-9.]/g, '')
  const parts = raw.split('.')
  percentDraft.value = parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts[0]}.${parts.slice(1).join('').slice(0, 4)}`
}

function onPercentBlur() {
  if (mode.value !== 'percent') return
  commitPercent()
}

function onPercentKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    commitPercent()
    percentInput.value?.blur()
    emit('tab-next')
    emit('blur')
  }
}

function onAmountBlur() {
  if (mode.value !== 'amount') return
  percent.value = null
  clampToMin()
}

function onAmountTabNext() {
  percent.value = null
  emit('tab-next')
  emit('blur')
}

function focus() {
  void nextTick(() => {
    if (mode.value === 'percent') percentInput.value?.focus()
    else amountInput.value?.focus()
  })
}

function dismiss() {
  if (mode.value === 'percent') commitPercent()
  clampToMin()
  emit('blur')
}

function onDocPointerDown(e: PointerEvent) {
  if (props.disabled) return
  if (fieldEl.value?.contains(e.target as Node)) return
  dismiss()
}

function onFieldKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'Enter') {
    e.preventDefault()
    dismiss()
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    dismiss()
  }
}

onMounted(() => {
  clampToMin()
  document.addEventListener('pointerdown', onDocPointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})

defineExpose({ focus })
</script>

<template>
  <div
    ref="fieldEl"
    class="disc-field"
    :class="{ disabled, dense }"
    @keydown="onFieldKeydown"
  >
    <div class="disc-modes" role="group" :aria-label="`${ariaLabel} type`">
      <button
        type="button"
        class="disc-mode"
        :class="{ on: mode === 'amount' }"
        :disabled="disabled"
        :aria-pressed="mode === 'amount'"
        @click="setMode('amount')"
      >
        $
      </button>
      <button
        type="button"
        class="disc-mode"
        :class="{ on: mode === 'percent' }"
        :disabled="disabled"
        :aria-pressed="mode === 'percent'"
        @click="setMode('percent')"
      >
        %
      </button>
    </div>
    <LineCurrencyInput
      v-if="mode === 'amount'"
      ref="amountInput"
      v-model="amountValue"
      class="disc-input"
      :line-id="lineId"
      line-field="discount"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @blur="onAmountBlur"
      @tab-next="onAmountTabNext"
    />
    <input
      v-else
      ref="percentInput"
      class="num disc-input disc-percent"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :value="percentDraft"
      :disabled="disabled"
      :aria-label="`${ariaLabel} percent`"
      :data-line-id="lineId"
      data-line-field="discount"
      @input="onPercentInput"
      @blur="onPercentBlur"
      @keydown="onPercentKeydown"
    >
  </div>
</template>

<style scoped>
.disc-field {
  display: flex;
  align-items: stretch;
  min-width: 0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
.disc-field.disabled {
  opacity: 0.65;
}
.disc-modes {
  display: flex;
  flex: none;
  border-right: 1px solid #e2e8f0;
}
.disc-input,
.disc-field :deep(.line-currency-input) {
  flex: 1;
  min-width: 9.5em !important;
  width: 100%;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none;
  padding: 9px 12px;
  font-size: 16px;
  line-height: 1.25;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.disc-mode {
  appearance: none;
  border: none;
  background: #f8fafc;
  color: #64748b;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  width: 40px;
  cursor: pointer;
  padding: 0;
}
.disc-mode.on {
  background: #eef2ff;
  color: #4f46e5;
}
.disc-mode:disabled {
  cursor: default;
}
.disc-field.dense {
  height: 22px;
  min-height: 22px;
  border-radius: 6px;
}
.disc-field.dense .disc-mode {
  width: 22px;
  font-size: 11px;
}
.disc-field.dense .disc-input,
.disc-field.dense :deep(.line-currency-input) {
  padding: 0 6px;
  font-size: 13.5px;
  line-height: 20px;
  min-width: 4em !important;
}
</style>
