<script setup lang="ts">
import {
  additionalFromInclusiveDiscount,
  displayedInvoiceDiscount,
} from '#shared/invoice-discount'
import { addMoney } from '#shared/money'
import InvoiceDiscountField from '~/components/invoices/InvoiceDiscountField.vue'
import type { InvoiceSummaryRow } from '~/utils/invoice-editor-ui'
import { DiscountRevealSession } from '~/utils/discount-reveal'

const props = withDefaults(defineProps<{
  rows: InvoiceSummaryRow[]
  discountEditable?: boolean
  discountDisabled?: boolean
  discountBase?: string
  lineDiscountTotal?: string
}>(), {
  discountEditable: false,
  discountDisabled: false,
  discountBase: '0',
  lineDiscountTotal: '0',
})

const discountAmount = defineModel<string>('discountAmount', { default: '0' })
const discountPercent = defineModel<string | null>('discountPercent', { default: null })

const emit = defineEmits<{
  'discount-blur': []
}>()

const leadingRows = computed(() => props.rows.filter(row => !row.grand))
const grandRows = computed(() => props.rows.filter(row => row.grand))
const editingDiscount = ref(false)
const discountFieldRef = ref<{ focus: () => void } | null>(null)
const discountReveal = new DiscountRevealSession()
const DISCOUNT_HINT = 'Tap and hold, or double-click, to edit discount'

const inclusiveBase = computed(() => {
  try {
    return addMoney(props.discountBase || '0', props.lineDiscountTotal || '0')
  }
  catch {
    return props.discountBase || '0'
  }
})

const inclusiveAmount = computed({
  get: () => displayedInvoiceDiscount({
    subtotal: props.discountBase || '0',
    discountAmount: discountAmount.value,
    discountPercent: discountPercent.value,
    lineDiscountTotal: props.lineDiscountTotal,
  }),
  set: (value: string) => {
    discountPercent.value = null
    discountAmount.value = additionalFromInclusiveDiscount(value, props.lineDiscountTotal || '0')
  },
})

function setDiscountFieldRef(el: unknown) {
  discountFieldRef.value = el as { focus: () => void } | null
}

function isDiscountRow(row: InvoiceSummaryRow) {
  return row.label === 'Discount'
}

function canEditDiscount() {
  return props.discountEditable && !props.discountDisabled
}

function openDiscountEdit() {
  if (!canEditDiscount() || editingDiscount.value) return
  editingDiscount.value = true
}

function closeDiscountEdit() {
  if (!editingDiscount.value) return
  editingDiscount.value = false
  emit('discount-blur')
}

function onDiscountRowDblClick() {
  if (!canEditDiscount()) return
  if (editingDiscount.value) closeDiscountEdit()
  else openDiscountEdit()
}

function onDiscountHoldStart(event: PointerEvent) {
  if (!canEditDiscount()) return
  discountReveal.start(event, openDiscountEdit)
}

function onDiscountHoldMove(event: PointerEvent) {
  discountReveal.move(event)
}

function onDiscountHoldEnd() {
  discountReveal.cancel()
}

function onDiscountContextMenu(event: Event) {
  if (!canEditDiscount()) return
  discountReveal.fromContextMenu(event, openDiscountEdit)
}

onBeforeUnmount(() => {
  discountReveal.cancel()
})

watch(editingDiscount, (open) => {
  if (!open) return
  void nextTick(() => {
    void nextTick(() => discountFieldRef.value?.focus())
  })
})

watch(() => props.discountDisabled, (disabled) => {
  if (disabled) editingDiscount.value = false
})
</script>

<template>
  <div class="ed-sums">
    <div
      v-for="(row, i) in leadingRows"
      :key="`lead-${i}`"
      class="row"
      :class="{
        'ed-sums-discount-row': isDiscountRow(row),
        'ed-sums-discount-hit': canEditDiscount() && isDiscountRow(row),
      }"
      :title="canEditDiscount() && isDiscountRow(row) ? DISCOUNT_HINT : undefined"
      @pointerdown="isDiscountRow(row) ? onDiscountHoldStart($event) : undefined"
      @pointermove="isDiscountRow(row) ? onDiscountHoldMove($event) : undefined"
      @pointerup="isDiscountRow(row) ? onDiscountHoldEnd() : undefined"
      @pointercancel="isDiscountRow(row) ? onDiscountHoldEnd() : undefined"
      @contextmenu="isDiscountRow(row) ? onDiscountContextMenu($event) : undefined"
      @dblclick.prevent="isDiscountRow(row) ? onDiscountRowDblClick() : undefined"
    >
      <span>{{ row.label }}<span v-if="row.note" class="sum-note">({{ row.note }})</span></span>
      <span
        v-if="!(canEditDiscount() && isDiscountRow(row) && editingDiscount)"
        class="sum-value"
        :class="{
          'sum-strike': row.strikethrough,
          'sum-discount-hit': canEditDiscount() && isDiscountRow(row),
        }"
      >{{ row.value }}</span>
      <span
        v-else
        class="sum-value sum-value-edit"
        @dblclick.stop.prevent="closeDiscountEdit"
      >
        <InvoiceDiscountField
          :ref="setDiscountFieldRef"
          v-model:amount="inclusiveAmount"
          dense
          :min-amount="lineDiscountTotal"
          :base-amount="inclusiveBase"
          :disabled="discountDisabled"
          aria-label="Invoice discount"
          @blur="closeDiscountEdit"
        />
      </span>
    </div>
    <div
      v-for="(row, i) in grandRows"
      :key="`grand-${i}`"
      class="row"
      :class="{ grand: row.grand }"
    >
      <span>{{ row.label }}<span v-if="row.note" class="sum-note">({{ row.note }})</span></span>
      <span :class="{ 'sum-strike': row.strikethrough }">{{ row.value }}</span>
    </div>
  </div>
</template>
