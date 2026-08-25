<script setup lang="ts">
import InvoiceDiscountField from '~/components/invoices/InvoiceDiscountField.vue'
import type { InvoiceSummaryRow } from '~/utils/invoice-editor-ui'

const props = withDefaults(defineProps<{
  rows: InvoiceSummaryRow[]
  discountEditable?: boolean
  discountDisabled?: boolean
  discountBase?: string
}>(), {
  discountEditable: false,
  discountDisabled: false,
  discountBase: '0',
})

const discountAmount = defineModel<string>('discountAmount', { default: '0' })
const discountPercent = defineModel<string | null>('discountPercent', { default: null })

const emit = defineEmits<{
  'discount-blur': []
}>()

const leadingRows = computed(() => props.rows.filter(row => !row.grand))
const grandRows = computed(() => props.rows.filter(row => row.grand))
</script>

<template>
  <div class="ed-sums">
    <div
      v-for="(row, i) in leadingRows"
      :key="`lead-${i}`"
      class="row"
    >
      <span>{{ row.label }}<span v-if="row.note" class="sum-note">({{ row.note }})</span></span>
      <span :class="{ 'sum-strike': row.strikethrough }">{{ row.value }}</span>
    </div>
    <div v-if="discountEditable" class="row ed-sums-discount">
      <span>Discount</span>
      <InvoiceDiscountField
        v-model:amount="discountAmount"
        v-model:percent="discountPercent"
        :base-amount="discountBase"
        :disabled="discountDisabled"
        aria-label="Invoice discount"
        @blur="emit('discount-blur')"
      />
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
