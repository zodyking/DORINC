<script setup lang="ts">
import {
  formatPercentOffField,
  normalizePercentOff,
  percentOffFromAmount,
} from '#shared/invoice-discount'
import { percentOfMoney } from '#shared/money'
import LineCurrencyInput from '~/components/invoices/LineCurrencyInput.vue'

const amount = defineModel<string | null>('amount', { default: '0.00' })
const percent = defineModel<string | null>('percent', { default: null })

const amountValue = computed({
  get: () => amount.value || '0.00',
  set: (value: string) => { amount.value = value },
})

const props = withDefaults(defineProps<{
  disabled?: boolean
  lineId?: string
  /** Gross amount used when switching $ → % (line total or invoice subtotal). */
  baseAmount?: string
  ariaLabel?: string
}>(), {
  disabled: false,
  lineId: undefined,
  baseAmount: '0',
  ariaLabel: 'Discount',
})

const emit = defineEmits<{
  blur: []
  'tab-next': []
}>()

const mode = ref<'amount' | 'percent'>(normalizePercentOff(percent.value) ? 'percent' : 'amount')
const percentDraft = ref(percent.value ?? '')
const percentInput = ref<HTMLInputElement | null>(null)

watch(() => percent.value, (value) => {
  if (normalizePercentOff(value)) {
    mode.value = 'percent'
    percentDraft.value = value ?? ''
  }
}, { immediate: true })

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
    return
  }
  if (normalizePercentOff(percent.value) && props.baseAmount) {
    amount.value = percentOfMoney(props.baseAmount, percent.value!)
  }
  percent.value = null
  percentDraft.value = ''
  mode.value = 'amount'
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
}

function onPercentInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.replace(/[^0-9.]/g, '')
  const parts = raw.split('.')
  percentDraft.value = parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts[0]}.${parts.slice(1).join('').slice(0, 4)}`
}

function onPercentBlur() {
  commitPercent()
  emit('blur')
}

function onPercentKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault()
    commitPercent()
    percentInput.value?.blur()
    emit('tab-next')
  }
}

function onAmountBlur() {
  percent.value = null
  emit('blur')
}

function onAmountTabNext() {
  percent.value = null
  emit('tab-next')
}
</script>

<template>
  <div class="disc-field" :class="{ disabled }">
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
.disc-mode {
  appearance: none;
  border: none;
  background: #f8fafc;
  color: #64748b;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  width: 28px;
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
.disc-input,
.disc-field :deep(.line-currency-input) {
  flex: 1;
  min-width: 4.25em !important;
  width: 100%;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none;
  padding: 8px 8px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
